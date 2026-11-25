import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { DataSource, MoreThan } from 'typeorm';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

import { FeePlan } from '../fee-plan/fee-plan.entity';
import { PaymentOrder } from '../payment-orders/payment-orders.entity';
import { Payment } from './payment.entity';
import { AuditLog } from '../audit-logs/audit-log.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { assertCanAppoint, assertCanReferCustomer } from '../impl-staff/staff-hierarchy';
// import { Customer } from '../customers/customer.entity';
import { User } from '../users/user.entity';
import { ImplStaff } from '../impl-staff/impl-staff.entity';

const ORDER_VALID_MINUTES = 30;

/**
 * Staff joining flow:
 *   1. POST /payments/create-order  { payer_type: 'STAFF', role_id }
 *        → checks the creator may appoint that role, creates a Razorpay order
 *   2. Razorpay checkout (frontend)
 *   3. POST /payments/verify        → signature + captured check, order → PAID
 *   4. POST /staff/create           → creates user + staff, links this payment,
 *                                      creates commission rows
 */
@Injectable()
export class PaymentsService {
  private readonly razorpay: Razorpay;
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(private readonly dataSource: DataSource) {
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

    if (!keyId || !keySecret) {
      throw new ServiceUnavailableException('Razorpay credentials are not configured');
    }

    this.keyId = keyId;
    this.keySecret = keySecret;
    this.razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  // --------------------------------------------------
  // CREATE PAYMENT ORDER
  // POST /api/payments/create-order
  // --------------------------------------------------
  async createOrder(dto: CreateOrderDto, meUserId: number) {
    // 1. Active fee plan
    const plan = await this.dataSource
      .getRepository(FeePlan)
      .findOne({ where: { plan_for: dto.payer_type, status: 1 } });

    if (!plan) {
      throw new NotFoundException('No active fee plan found for this payer type');
    }

    // 2. Who is this order for?
    let payerId: number;

    if (dto.payer_type === 'STAFF') {
      // Staff doesn't exist yet: check the creator may appoint this role BEFORE taking money.
      // payer_id = creator's user id for now; /staff/create replaces it with the new staff id.
      await assertCanAppoint(
        this.dataSource.manager,
        meUserId,
        dto.role_id!,
        undefined,
        dto.referrer_staff_code,
      );
      await this.assertStaffContactFree(dto.email, dto.mobile_number);
      payerId = meUserId;
    } else {
      // CUSTOMER: same rules — any active staff or the IMPL team can refer.
      // payer_id = creator's user id for now; /customers/create replaces it with the customer id.
      await assertCanReferCustomer(this.dataSource.manager, meUserId, dto.referrer_staff_code);
      await this.assertStaffContactFree(dto.email, dto.mobile_number);
      payerId = meUserId;
    }

    const orderRepo = this.dataSource.getRepository(PaymentOrder);

    // 3. Reuse an unpaid order only if Razorpay confirms it is still usable
    const existing = await orderRepo.findOne({
      where: {
        payer_type: dto.payer_type,
        payer_id: String(payerId),
        created_by: meUserId,
        status: 'CREATED',
        expires_at: MoreThan(new Date()),
      },
    });

    if (existing?.razorpay_order_id) {
      let reusable = false;
      try {
        const rzp = await this.razorpay.orders.fetch(existing.razorpay_order_id);
        reusable =
          rzp.status === 'created' && Number(rzp.amount) === Number(existing.amount_paise);
      } catch {
        // order belongs to another key/account → discard
      }

      if (reusable) return this.orderResponse(existing);

      existing.status = 'EXPIRED';
      await orderRepo.save(existing);
    }

    // 4. Amount in paise
    const amountPaise = Math.round(Number(plan.total_amount) * 100);
    if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
      throw new BadRequestException('The fee plan amount must be greater than zero');
    }

    // 5. Razorpay order
    const receiptNo = `${dto.payer_type[0]}${payerId}-${Date.now()}`;
    const rzpOrder = await this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: receiptNo,
      notes: {
        payer_type: dto.payer_type,
        created_by: String(meUserId),
        role_id: dto.role_id ? String(dto.role_id) : '',
      },
    });

    // 6. Save in MySQL
    const order = await orderRepo.save(
      orderRepo.create({
        payer_type: dto.payer_type,
        payer_id: String(payerId),
        fee_plan_id: plan.id,
        base_amount: String(plan.base_amount),
        gst_amount: String(plan.gst_amount),
        total_amount: String(plan.total_amount),
        amount_paise: String(amountPaise),
        razorpay_order_id: rzpOrder.id,
        receipt_no: receiptNo,
        status: 'CREATED',
        expires_at: new Date(Date.now() + ORDER_VALID_MINUTES * 60 * 1000),
        created_by: meUserId,
      }),
    );

    return this.orderResponse(order);
  }

/** Check that email and mobile are not already registered */
private async assertStaffContactFree(emailRaw?: string, mobileRaw?: string) {
  const email = emailRaw?.trim().toLowerCase();
  const mobile = mobileRaw?.trim();

  if (!email && !mobile) return;

  const manager = this.dataSource.manager;

  if (email) {
    const taken =
      (await manager.findOne(User, { where: { email } })) ||
      (await manager.findOne(ImplStaff, { where: { email } }));

    if (taken) {
      throw new ConflictException('Email is already registered');
    }
  }

  if (mobile) {
    const taken =
      (await manager.findOne(User, { where: { mobile } })) ||
      (await manager.findOne(ImplStaff, {
        where: { mobile_number: mobile },
      }));

    if (taken) {
      throw new ConflictException('Mobile number is already registered');
    }
  }
}

  private orderResponse(order: PaymentOrder) {
    return {
      order_id: order.razorpay_order_id,
      payment_order_id: order.payment_order_id,
      amount: order.total_amount,
      amount_paise: Number(order.amount_paise),
      currency: 'INR',
      status: 'created',
      key_id: this.keyId,
    };
  }

  // --------------------------------------------------
  // VERIFY FRONTEND PAYMENT
  // POST /api/payments/verify
  // --------------------------------------------------
  async verifyPayment(body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new BadRequestException('Razorpay order ID, payment ID and signature are required');
    }

    const order = await this.dataSource
      .getRepository(PaymentOrder)
      .findOne({ where: { razorpay_order_id } });

    if (!order) throw new NotFoundException('Payment order not found');

    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(`${order.razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!this.safeEqual(expectedSignature, razorpay_signature)) {
      throw new UnauthorizedException('Invalid Razorpay payment signature');
    }

    const payment = await this.razorpay.payments.fetch(razorpay_payment_id);

    if (payment.order_id !== order.razorpay_order_id) {
      throw new BadRequestException('Payment does not belong to this order');
    }
    if (payment.status !== 'captured') {
      throw new BadRequestException(`Payment is not captured. Current status: ${payment.status}`);
    }
    if (Number(payment.amount) !== Number(order.amount_paise)) {
      throw new BadRequestException('Razorpay payment amount does not match the order amount');
    }

    return this.markPaid(
      order.razorpay_order_id!,
      razorpay_payment_id,
      razorpay_signature,
      Number(payment.amount),
      payment.method,
    );
  }

  // --------------------------------------------------
  // RAZORPAY WEBHOOK
  // POST /api/payments/webhook
  // --------------------------------------------------
  async handleWebhook(rawBody: Buffer, signature: string, body: any) {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Razorpay webhook secret is not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!signature || !this.safeEqual(expectedSignature, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (body.event === 'payment.captured' || body.event === 'order.paid') {
      const payment = body.payload?.payment?.entity;
      if (!payment?.order_id || !payment?.id) {
        return { received: true, message: 'Event received; payment details are not available' };
      }
      return this.markPaid(payment.order_id, payment.id, null, payment.amount, payment.method);
    }

    return { received: true, event: body.event };
  }

  // --------------------------------------------------
  // RECORD PAYMENT + MARK ORDER PAID (one transaction)
  // Staff creation and commission happen in /staff/create.
  // --------------------------------------------------
  private async markPaid(
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string | null,
    paidAmountPaise: number,
    paymentMethod?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(PaymentOrder, {
        where: { razorpay_order_id: razorpayOrderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) throw new NotFoundException('Order not found');

      if (order.status === 'PAID') {
        return {
          status: 'PAID',
          already_processed: true,
          payment_order_id: order.payment_order_id,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          message: 'Payment was already processed',
        };
      }

      // A late payment on an order we retired is still real money → accept it
      if (!['CREATED', 'EXPIRED'].includes(order.status)) {
        throw new BadRequestException(`Order cannot be paid because its status is ${order.status}`);
      }

      if (Number(order.amount_paise) !== paidAmountPaise) {
        throw new BadRequestException('Paid amount does not match the order amount');
      }

      const existingPayment = await manager.findOne(Payment, {
        where: { razorpay_payment_id: razorpayPaymentId },
      });
      if (existingPayment) {
        throw new BadRequestException('This Razorpay payment has already been recorded');
      }

      const savedPayment = await manager.save(
        Payment,
        manager.create(Payment, {
          payment_order_id: String(order.payment_order_id),
          razorpay_payment_id: razorpayPaymentId,
          razorpay_signature: razorpaySignature,
          amount: order.total_amount,
          payment_method: paymentMethod ?? null,
          status: 1,
          paid_at: new Date(),
        }),
      );

      order.status = 'PAID';
      await manager.save(order);

      await manager.save(
        AuditLog,
        manager.create(AuditLog, {
          user_id: order.created_by,
          action: 'PAYMENT_CAPTURED',
          entity_type: order.payer_type,
          entity_id: String(order.payer_id),
          description: `Payment ${razorpayPaymentId} captured for order ${razorpayOrderId} (₹${order.total_amount})`,
        }),
      );

      return {
        status: 'PAID',
        payment_id: savedPayment.payment_id,
        payment_order_id: order.payment_order_id,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        message: 'Payment verified',
      };
    });
  }

  private safeEqual(a: string, b: string): boolean {
    const x = Buffer.from(a, 'utf8');
    const y = Buffer.from(b, 'utf8');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }
}