import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Payment, PaymentDirection } from './payment.entity';
import { Invoice, InvoiceStatus, InvoiceType } from '../invoices/invoice.entity';
import { Party } from '../parties/party.entity';
import { RazorpayOrder } from './razorpay-order.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, readScope, round2, writeCompanyId } from '../common/tenant';

export const PAYMENT_METHODS = ['cash', 'bank', 'upi', 'card', 'cheque', 'razorpay', 'other'];

export class CreatePaymentDto {
  @IsUUID()
  partyId: string;

  /** Settle a specific invoice. Omit for an advance / on-account payment. */
  @IsOptional() @IsUUID()
  invoiceId?: string;

  @IsEnum(PaymentDirection)
  direction: PaymentDirection;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @IsString() @MaxLength(20)
  method?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'paymentDate must be YYYY-MM-DD' })
  paymentDate?: string;

  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class PaymentQueryDto {
  @IsOptional() @IsString()
  direction?: string;

  @IsOptional() @IsString()
  partyId?: string;

  @IsOptional() @IsString()
  from?: string;

  @IsOptional() @IsString()
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Party) private readonly partyRepo: Repository<Party>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Delete a payment and take it back off the invoice it settled. */
  async remove(id: string, user: AuthUser): Promise<void> {
    const companyId = writeCompanyId(user);
    const removed = await this.paymentRepo.manager.transaction(async (m) => {
      const payment = await m.findOne(Payment, { where: { id } });
      if (!payment || payment.companyId !== companyId) throw new NotFoundException('Payment not found');
      if (await m.count(RazorpayOrder, { where: { paymentRecordId: id } })) {
        throw new BadRequestException('Online (Razorpay) payments cannot be deleted because the money was really collected');
      }
      if (payment.invoiceId) {
        const invoice = await m.findOne(Invoice, { where: { id: payment.invoiceId } });
        if (invoice && invoice.status !== InvoiceStatus.CANCELLED) {
          invoice.paidAmount = round2(Math.max(0, invoice.paidAmount - payment.amount));
          invoice.status = invoice.paidAmount <= 0 ? InvoiceStatus.ISSUED : invoice.paidAmount >= invoice.total ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
          await m.save(invoice);
        }
      }
      await m.remove(payment);
      return payment;
    });
    await this.audit.log({
      actorId: user.id, action: 'PAYMENT_DELETED', resourceType: 'payment', resourceId: id,
      details: { amount: removed.amount, direction: removed.direction, invoiceId: removed.invoiceId },
    });
  }

  async create(dto: CreatePaymentDto, user: AuthUser): Promise<Payment> {
    return this.record(writeCompanyId(user), dto, user.id);
  }

  /**
   * Record a payment and apply it to an invoice's balance. Used for manual entries and for
   * online payments (Razorpay). Pass `outer` to take part in the caller's transaction.
   */
  async record(
    companyId: string,
    dto: CreatePaymentDto,
    actorId: string | null,
    outer?: EntityManager,
  ): Promise<Payment> {
    const method = dto.method ?? 'cash';
    if (!PAYMENT_METHODS.includes(method)) {
      throw new BadRequestException(`method must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }

    const party = await (outer ?? this.paymentRepo.manager).findOne(Party, { where: { id: dto.partyId } });
    if (!party || party.companyId !== companyId) throw new BadRequestException('Party not found');

    const amount = round2(dto.amount);

    const run = <T>(fn: (m: EntityManager) => Promise<T>) =>
      outer ? fn(outer) : this.paymentRepo.manager.transaction(fn);

    const payment = await run(async (manager) => {
      if (dto.invoiceId) {
        const invoice = await manager.findOne(Invoice, { where: { id: dto.invoiceId } });
        if (!invoice || invoice.companyId !== companyId || invoice.partyId !== party.id) {
          throw new BadRequestException('Invoice not found for this party');
        }
        if (invoice.status === InvoiceStatus.CANCELLED) {
          throw new BadRequestException('Cannot record a payment against a cancelled invoice');
        }
        const expected = invoice.type === InvoiceType.SALE ? PaymentDirection.IN : PaymentDirection.OUT;
        if (dto.direction !== expected) {
          throw new BadRequestException(
            invoice.type === InvoiceType.SALE
              ? 'Sales invoices are settled by payments received (direction "in")'
              : 'Purchase bills are settled by payments made (direction "out")',
          );
        }
        const due = round2(invoice.total - invoice.paidAmount);
        if (amount > due) throw new BadRequestException(`Amount exceeds the balance due (${due})`);

        invoice.paidAmount = round2(invoice.paidAmount + amount);
        invoice.status = invoice.paidAmount >= invoice.total ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;
        await manager.save(invoice);
      }

      return manager.save(
        manager.create(Payment, {
          companyId,
          partyId: party.id,
          invoiceId: dto.invoiceId ?? null,
          direction: dto.direction,
          amount,
          method,
          paymentDate: dto.paymentDate ?? new Date().toISOString().slice(0, 10),
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          createdBy: actorId,
        }),
      );
    });

    await this.audit.log({
      actorId: actorId ?? undefined, action: 'PAYMENT_RECORDED', resourceType: 'payment', resourceId: payment.id,
      details: { amount, direction: payment.direction, partyId: party.id, invoiceId: payment.invoiceId },
    });
    await this.notifications.notifyCompany(companyId, {
      type: 'payment',
      title: payment.direction === 'in' ? 'Payment received' : 'Payment made',
      message: `${amount} ${payment.direction === 'in' ? 'received from' : 'paid to'} ${party.name}.`,
      link: '/payments',
    }, actorId ?? undefined);
    return payment;
  }

  async findAll(query: PaymentQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 200);
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.party', 'party')
      .leftJoinAndSelect('p.invoice', 'invoice')
      .orderBy('p.paymentDate', 'DESC')
      .addOrderBy('p.createdAt', 'DESC');

    const scope = readScope(user);
    if (scope) qb.andWhere('p.companyId = :scope', { scope });
    if (query.direction) qb.andWhere('p.direction = :d', { d: query.direction });
    if (query.partyId) qb.andWhere('p.partyId = :partyId', { partyId: query.partyId });
    if (query.from) qb.andWhere('p.paymentDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('p.paymentDate <= :to', { to: query.to });
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    const totalsQb = this.paymentRepo
      .createQueryBuilder('p')
      .select('p.direction', 'direction')
      .addSelect('SUM(p.amount)', 'sum')
      .groupBy('p.direction');
    if (scope) totalsQb.andWhere('p.companyId = :scope', { scope });
    const sums = await totalsQb.getRawMany<{ direction: string; sum: number }>();
    const sumOf = (d: PaymentDirection) => round2(Number(sums.find((s) => s.direction === d)?.sum ?? 0));

    return { data, total, page, limit, totals: { received: sumOf(PaymentDirection.IN), paid: sumOf(PaymentDirection.OUT) } };
  }
}
