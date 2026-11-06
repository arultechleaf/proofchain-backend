import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Payment, PaymentDirection } from './payment.entity';
import { Invoice, InvoiceStatus, InvoiceType } from '../invoices/invoice.entity';
import { Party } from '../parties/party.entity';
import { RazorpayOrder } from './razorpay-order.entity';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, readScope, round2, writeCompanyId } from '../common/tenant';
import { AccountType, BankAccount, BankTransaction, BankTxType, CREDIT_TYPES } from '../cash-bank/cash-bank.entities';

export const PAYMENT_METHODS = ['cash', 'bank', 'upi', 'card', 'cheque', 'razorpay', 'other'];

export class CreatePaymentDto {
  @Type(() => Number) @IsInt()
  partyId: number;

  /** Settle a specific invoice. Omit for an advance / on-account payment. */
  @IsOptional() @Type(() => Number) @IsInt()
  invoiceId?: number;

  @IsEnum(PaymentDirection)
  direction: PaymentDirection;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @IsString() @MaxLength(20)
  method?: string;

  /** The cash/bank account this money goes into (received) or comes out of (paid). */
  @IsOptional() @Type(() => Number) @IsInt()
  accountId?: number;

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

  @IsOptional() @Type(() => Number) @IsInt()
  partyId?: number;

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
  async remove(id: number, user: AuthUser): Promise<void> {
    const companyId = writeCompanyId(user);
    const removed = await this.paymentRepo.manager.transaction(async (m) => {
      const payment = await m.findOne(Payment, { where: { id } });
      if (!payment || payment.companyId !== companyId) throw new NotFoundException('Payment not found');
      if (await m.count(RazorpayOrder, { where: { paymentRecordId: id } })) {
        throw new BadRequestException('Online (Razorpay) payments cannot be deleted because the money was really collected');
      }
      await m.delete(BankTransaction, { paymentId: id }); // the cash/bank movement this payment made goes with it
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

  /** The company's active cash or bank accounts, for the "which account" choice on payment forms. */
  async accounts(user: AuthUser, type?: 'cash' | 'bank') {
    const companyId = writeCompanyId(user);
    return this.paymentRepo.manager.find(BankAccount, {
      where: { companyId, isActive: true, ...(type ? { accountType: type as AccountType } : {}) },
      order: { name: 'ASC' },
      select: { id: true, name: true, accountType: true },
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
    companyId: number,
    dto: CreatePaymentDto,
    actorId: number | null,
    outer?: EntityManager,
  ): Promise<Payment> {
    const method = dto.method ?? 'cash';
    if (!PAYMENT_METHODS.includes(method)) {
      throw new BadRequestException(`method must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }
    // cash in hand needs no account; only a bank payment must say which bank received it
    const accountRequired = method === 'bank';
    if (accountRequired && !dto.accountId) {
      throw new BadRequestException(`Select a ${method} account for this payment`);
    }
    if (dto.accountId && method !== 'cash' && method !== 'bank' && method !== 'razorpay') {
      throw new BadRequestException('A cash/bank account can only be selected for cash, bank, or Razorpay payments');
    }

    const party = await (outer ?? this.paymentRepo.manager).findOne(Party, { where: { id: dto.partyId } });
    if (!party || party.companyId !== companyId) throw new BadRequestException('Party not found');

    const amount = round2(dto.amount);

    const run = <T>(fn: (m: EntityManager) => Promise<T>) =>
      outer ? fn(outer) : this.paymentRepo.manager.transaction(fn);

    const payment = await run(async (manager) => {
      let account: BankAccount | null = null;
      if (dto.accountId) {
        account = await manager.findOne(BankAccount, { where: { id: dto.accountId, companyId, isActive: true } });
        if (!account) throw new BadRequestException('Cash/bank account not found or inactive');
        const expectedType = method === 'cash' ? AccountType.CASH : AccountType.BANK;
        if (account.accountType !== expectedType) {
          throw new BadRequestException(`Select a ${expectedType} account for this payment`);
        }
        if (dto.direction === PaymentDirection.OUT) {
          const net = await manager.getRepository(BankTransaction)
            .createQueryBuilder('t')
            .select(
              `COALESCE(SUM(CASE WHEN t.type IN ('${CREDIT_TYPES.join("','")}') THEN t.amount ELSE -t.amount END), 0)`,
              'net',
            )
            .where('t.accountId = :accountId', { accountId: account.id })
            .getRawOne<{ net: string | number }>();
          const balance = round2(account.openingBalance + Number(net?.net ?? 0));
          if (amount > balance) throw new BadRequestException(`Insufficient balance in "${account.name}" (available ${balance})`);
        }
      }

      let invoiceNumber: string | null = null;
      if (dto.invoiceId) {
        const invoice = await manager.findOne(Invoice, { where: { id: dto.invoiceId } });
        if (!invoice || invoice.companyId !== companyId || invoice.partyId !== party.id) {
          throw new BadRequestException('Invoice not found for this party');
        }
        if (invoice.status === InvoiceStatus.CANCELLED) {
          throw new BadRequestException('Cannot record a payment against a cancelled invoice');
        }
        invoiceNumber = invoice.invoiceNumber;
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

      const saved = await manager.save(
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
      if (account) {
        await manager.save(
          manager.create(BankTransaction, {
            companyId,
            accountId: account.id,
            paymentId: saved.id,
            type: dto.direction === PaymentDirection.IN ? BankTxType.DEPOSIT : BankTxType.WITHDRAWAL,
            amount,
            transactionDate: saved.paymentDate,
            // e.g. "Received from Acme Retail · INV-0007 · UPI (Razorpay)"
            description: [
              `${dto.direction === PaymentDirection.IN ? 'Received from' : 'Paid to'} ${party.name}`,
              invoiceNumber,
              method === 'razorpay' ? 'UPI (Razorpay)' : method.toUpperCase(),
            ].filter(Boolean).join(' · '),
            reference: dto.reference ?? null,
            createdBy: actorId,
          }),
        );
      }
      return saved;
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

    const [rows, total] = await qb.getManyAndCount();

    // which cash/bank account each payment went into (the movement it made is linked by payment id)
    const ids = rows.map((p) => p.id);
    const links = ids.length
      ? await this.paymentRepo.manager
          .createQueryBuilder(BankTransaction, 't')
          .innerJoin(BankAccount, 'a', 'a.id = t.accountId')
          .select('t.paymentId', 'paymentId')
          .addSelect('a.name', 'name')
          .where('t.paymentId IN (:...ids)', { ids })
          .getRawMany<{ paymentId: number; name: string }>()
      : [];
    const accountOf = new Map(links.map((l) => [Number(l.paymentId), l.name]));
    const data = rows.map((p) => Object.assign(p, { accountName: accountOf.get(p.id) ?? null }));

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
