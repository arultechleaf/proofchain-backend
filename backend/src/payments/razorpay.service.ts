import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsNumber, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import * as crypto from 'crypto';
import { RazorpayOrder } from './razorpay-order.entity';
import { PaymentsService } from './payments.service';
import { PaymentDirection } from './payment.entity';
import { Invoice, InvoiceStatus, InvoiceType } from '../invoices/invoice.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser, assertAccess, round2, writeCompanyId } from '../common/tenant';

export class CreateRazorpayOrderDto {
  @IsUUID()
  invoiceId: string;

  /** Rupees. Defaults to the full balance due; may be less for a part payment. */
  @IsOptional() @IsNumber() @Min(1) @Type(() => Number)
  amount?: number;
}

export class VerifyRazorpayPaymentDto {
  @IsString() @MaxLength(64)
  orderId: string;

  @IsString() @MaxLength(64)
  paymentId: string;

  @IsString() @MaxLength(128)
  signature: string;
}

interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
}

const CURRENCY = 'INR';

/** Constant-time string comparison that tolerates different lengths. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    @InjectRepository(RazorpayOrder) private readonly orderRepo: Repository<RazorpayOrder>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  // ── configuration ────────────────────────────────────────────────────────

  private get keyId(): string { return this.config.get<string>('RAZORPAY_KEY_ID', '').trim(); }
  private get keySecret(): string { return this.config.get<string>('RAZORPAY_KEY_SECRET', '').trim(); }
  private get webhookSecret(): string { return this.config.get<string>('RAZORPAY_WEBHOOK_SECRET', '').trim(); }
  /** Overridable so tests can point at a local fake instead of the real API. */
  private get apiBase(): string {
    return this.config.get<string>('RAZORPAY_API_BASE', 'https://api.razorpay.com/v1').replace(/\/$/, '');
  }

  get enabled(): boolean {
    return !!this.keyId && !!this.keySecret;
  }

  /** Public settings for the browser. The secret is never exposed. */
  getConfig() {
    return {
      enabled: this.enabled,
      keyId: this.enabled ? this.keyId : null,
      mode: this.keyId.startsWith('rzp_live_') ? 'live' : 'test',
      webhookConfigured: !!this.webhookSecret,
    };
  }

  private requireEnabled() {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'Online payments are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the backend .env.',
      );
    }
  }

  // ── step 1: create an order ──────────────────────────────────────────────

  async createOrder(dto: CreateRazorpayOrderDto, user: AuthUser) {
    this.requireEnabled();
    const companyId = writeCompanyId(user);

    const invoice = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId }, relations: { party: true } });
    if (!invoice || invoice.companyId !== companyId) throw new NotFoundException('Invoice not found');
    if (invoice.type !== InvoiceType.SALE) {
      throw new BadRequestException('Online payment is only available for sales invoices');
    }
    if (invoice.status === InvoiceStatus.CANCELLED) throw new BadRequestException('This invoice is cancelled');

    const due = round2(invoice.total - invoice.paidAmount);
    if (due <= 0) throw new BadRequestException('This invoice is already paid');
    const amount = round2(dto.amount ?? due);
    if (amount < 1) throw new BadRequestException('Minimum online payment is ₹1');
    if (amount > due) throw new BadRequestException(`Amount exceeds the balance due (${due})`);

    const order = await this.api<{ id: string; amount: number; currency: string }>('POST', '/orders', {
      amount: Math.round(amount * 100), // paise
      currency: CURRENCY,
      receipt: invoice.invoiceNumber.slice(0, 40),
      notes: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber },
    });

    await this.orderRepo.save(
      this.orderRepo.create({
        orderId: order.id,
        companyId,
        invoiceId: invoice.id,
        partyId: invoice.partyId,
        amount,
        currency: CURRENCY,
        createdBy: user.id,
      }),
    );
    await this.audit.log({
      actorId: user.id, action: 'RAZORPAY_ORDER_CREATED', resourceType: 'invoice', resourceId: invoice.id,
      details: { orderId: order.id, amount },
    });

    return {
      orderId: order.id,
      amount: order.amount, // paise, as Razorpay Checkout expects
      currency: order.currency,
      keyId: this.keyId,
      invoiceNumber: invoice.invoiceNumber,
      customer: {
        name: invoice.party?.name ?? '',
        email: invoice.party?.email ?? '',
        contact: invoice.party?.phone ?? '',
      },
    };
  }

  // ── step 2: verify what Checkout returned and record the payment ─────────

  async verifyPayment(dto: VerifyRazorpayPaymentDto, user: AuthUser) {
    this.requireEnabled();
    const order = await this.orderRepo.findOne({ where: { orderId: dto.orderId } });
    if (!order) throw new NotFoundException('Unknown order');
    assertAccess(order.companyId, user, 'Order');

    // Already settled (by the webhook, or a retry of this call): nothing more to do.
    if (order.status === 'paid') return this.result(order);

    // The signature proves Razorpay (and not the browser) issued this payment id for this order.
    const expected = crypto.createHmac('sha256', this.keySecret).update(`${dto.orderId}|${dto.paymentId}`).digest('hex');
    if (!safeEqual(expected, dto.signature)) {
      this.logger.warn(`Bad Razorpay signature for order ${dto.orderId}`);
      throw new BadRequestException('Payment signature could not be verified');
    }

    await this.confirmWithRazorpay(order, dto.paymentId);
    const settled = await this.settle(order.orderId, dto.paymentId, user.id);
    return this.result(settled);
  }

  // ── webhook: settles the order even if the browser never came back ───────

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('Webhook secret is not configured');
    }
    if (!rawBody || !signature) throw new UnauthorizedException('Missing signature');

    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    if (!safeEqual(expected, signature)) throw new UnauthorizedException('Invalid webhook signature');

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed webhook body');
    }

    if (event.event !== 'payment.captured' && event.event !== 'order.paid') return { status: 'ignored' };

    const payment: RazorpayPayment | undefined = event.payload?.payment?.entity;
    const orderId: string | undefined = payment?.order_id ?? event.payload?.order?.entity?.id;
    if (!payment?.id || !orderId) return { status: 'ignored' };

    const order = await this.orderRepo.findOne({ where: { orderId } });
    if (!order) return { status: 'unknown_order' }; // not ours; acknowledge so Razorpay stops retrying

    if (round2(payment.amount / 100) !== order.amount || payment.currency !== order.currency) {
      this.logger.error(`Webhook amount mismatch for ${orderId}: got ${payment.amount} ${payment.currency}`);
      return { status: 'amount_mismatch' };
    }
    await this.settle(orderId, payment.id, null);
    return { status: 'ok' };
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** Ask Razorpay for the payment itself and make sure it matches our order and is captured. */
  private async confirmWithRazorpay(order: RazorpayOrder, paymentId: string) {
    let payment = await this.api<RazorpayPayment>('GET', `/payments/${encodeURIComponent(paymentId)}`);

    if (payment.order_id !== order.orderId) throw new BadRequestException('Payment does not belong to this order');
    if (payment.amount !== Math.round(order.amount * 100) || payment.currency !== order.currency) {
      throw new BadRequestException('Paid amount does not match the order');
    }
    if (payment.status === 'authorized') {
      // Accounts without auto-capture leave the payment authorized until we capture it.
      payment = await this.api<RazorpayPayment>('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
        amount: payment.amount,
        currency: payment.currency,
      });
    }
    if (payment.status !== 'captured') {
      throw new BadRequestException(`Payment is not complete (status: ${payment.status})`);
    }
  }

  /**
   * Mark the order paid and record the Payment, exactly once. The conditional update is the
   * gate: whichever of verify/webhook gets there first wins and the other becomes a no-op.
   */
  private async settle(orderId: string, paymentId: string, actorId: string | null): Promise<RazorpayOrder> {
    await this.orderRepo.manager.transaction(async (manager) => {
      const claimed = await manager.update(
        RazorpayOrder,
        { orderId, status: 'created' },
        { status: 'paid', razorpayPaymentId: paymentId, paidAt: new Date().toISOString() },
      );
      if (!claimed.affected) return; // already settled

      const order = await manager.findOneByOrFail(RazorpayOrder, { orderId });
      const invoice = await manager.findOne(Invoice, { where: { id: order.invoiceId } });

      // If the invoice was settled some other way while the customer was paying, keep the
      // money but record it on account instead of against the invoice.
      const due = invoice ? round2(invoice.total - invoice.paidAmount) : 0;
      const applies = !!invoice && invoice.status !== InvoiceStatus.CANCELLED && order.amount <= due;

      const payment = await this.payments.record(
        order.companyId,
        {
          partyId: order.partyId,
          invoiceId: applies ? order.invoiceId : undefined,
          direction: PaymentDirection.IN,
          amount: order.amount,
          method: 'razorpay',
          reference: paymentId,
          notes: applies ? undefined : `Razorpay payment for order ${orderId}; invoice balance had changed, recorded on account`,
        },
        actorId,
        manager,
      );
      await manager.update(RazorpayOrder, { orderId }, { paymentRecordId: payment.id });
    });

    return this.orderRepo.findOneByOrFail({ orderId });
  }

  private async result(order: RazorpayOrder) {
    const invoice = await this.invoiceRepo.findOne({ where: { id: order.invoiceId } });
    return {
      status: order.status,
      paymentId: order.razorpayPaymentId,
      amount: order.amount,
      invoiceStatus: invoice?.status,
      balanceDue: invoice ? round2(invoice.total - invoice.paidAmount) : null,
    };
  }

  private async api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${this.apiBase}${path}`, {
        method,
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      this.logger.error(`Razorpay ${method} ${path} failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach Razorpay. Try again in a moment.');
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json?.error?.description ?? `HTTP ${res.status}`;
      this.logger.error(`Razorpay ${method} ${path} -> ${res.status}: ${reason}`);
      // 401 here means our own key pair is wrong, which is a server problem, not the user's.
      if (res.status === 401) throw new ServiceUnavailableException('Razorpay rejected the configured API keys');
      throw new BadRequestException(`Razorpay: ${reason}`);
    }
    return json as T;
  }
}
