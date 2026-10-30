import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { Invoice, InvoiceStatus, InvoiceType } from '../invoices/invoice.entity';
import { Payment, PaymentDirection } from '../payments/payment.entity';
import { ItemsService } from '../items/items.service';
import { AuthUser, readScope, round2 } from '../common/tenant';
import { StockSummaryQueryDto } from '../items/items.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SalesReportQueryDto {
  @IsOptional() @IsIn(['sale', 'purchase'])
  type?: 'sale' | 'purchase';

  @IsOptional() @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional() @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class OutstandingQueryDto {
  @IsOptional() @IsIn(['sale', 'purchase'])
  type?: 'sale' | 'purchase';
}

export class TransactionsQueryDto {
  @IsOptional() @IsIn(['all', 'sale', 'purchase', 'payment_in', 'payment_out'])
  kind?: 'all' | 'sale' | 'purchase' | 'payment_in' | 'payment_out';

  @IsOptional() @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional() @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly itemsService: ItemsService,
  ) {}

  /** Totals, daily trend, and top parties/items for sales or purchases in a date range. */
  async salesReport(query: SalesReportQueryDto, user: AuthUser) {
    const type = (query.type ?? 'sale') as InvoiceType;
    const to = query.to ?? new Date().toISOString().slice(0, 10);
    const from = query.from ?? this.daysBefore(to, 29);

    const scope = readScope(user);
    const qb = this.invoiceRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.party', 'party')
      .leftJoinAndSelect('i.lines', 'lines')
      .where('i.type = :type', { type })
      .andWhere('i.status != :cancelled', { cancelled: InvoiceStatus.CANCELLED })
      .andWhere('i.invoiceDate >= :from AND i.invoiceDate <= :to', { from, to });
    if (scope) qb.andWhere('i.companyId = :scope', { scope });
    const invoices = await qb.getMany();

    const sum = (f: (i: Invoice) => number) => round2(invoices.reduce((s, i) => s + f(i), 0));

    const daily = new Map<string, { date: string; total: number; count: number }>();
    for (let d = from; d <= to; d = this.daysBefore(d, -1)) daily.set(d, { date: d, total: 0, count: 0 });
    const parties = new Map<number, { partyId: number; name: string; total: number; count: number }>();
    const items = new Map<number | string, { description: string; quantity: number; amount: number }>();

    for (const i of invoices) {
      const day = daily.get(i.invoiceDate);
      if (day) { day.total = round2(day.total + i.total); day.count += 1; }

      const p = parties.get(i.partyId) ?? { partyId: i.partyId, name: i.party?.name ?? '—', total: 0, count: 0 };
      p.total = round2(p.total + i.total);
      p.count += 1;
      parties.set(i.partyId, p);

      for (const l of i.lines) {
        const key = l.itemId ?? l.description;
        const it = items.get(key) ?? { description: l.description, quantity: 0, amount: 0 };
        it.quantity = round2(it.quantity + l.quantity);
        it.amount = round2(it.amount + l.amount);
        items.set(key, it);
      }
    }

    return {
      type, from, to,
      totals: {
        count: invoices.length,
        subtotal: sum((i) => i.subtotal),
        tax: sum((i) => i.taxTotal),
        discount: sum((i) => i.discount),
        total: sum((i) => i.total),
        paid: sum((i) => i.paidAmount),
        outstanding: sum((i) => i.total - i.paidAmount),
      },
      daily: [...daily.values()],
      topParties: [...parties.values()].sort((a, b) => b.total - a.total).slice(0, 5),
      topItems: [...items.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
    };
  }

  /** Unpaid invoices with aging buckets measured from the due date (or invoice date). */
  async outstanding(query: OutstandingQueryDto, user: AuthUser) {
    const scope = readScope(user);
    const invoices = await this.invoiceRepo.find({
      where: {
        status: In([InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL]),
        ...(query.type ? { type: query.type as InvoiceType } : {}),
        ...(scope ? { companyId: scope } : {}),
      },
      relations: { party: true },
      order: { invoiceDate: 'ASC' },
    });

    const today = new Date().toISOString().slice(0, 10);
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    const rows = invoices.map((i) => {
      const due = round2(i.total - i.paidAmount);
      const dueDate = i.dueDate ?? i.invoiceDate;
      const daysOverdue = Math.max(0, this.diffDays(dueDate, today));
      const bucket =
        daysOverdue === 0 ? 'current' : daysOverdue <= 30 ? 'd1_30' : daysOverdue <= 60 ? 'd31_60'
        : daysOverdue <= 90 ? 'd61_90' : 'd90plus';
      buckets[bucket] = round2(buckets[bucket] + due);
      return {
        id: i.id, type: i.type, invoiceNumber: i.invoiceNumber, partyName: i.party?.name ?? '—',
        invoiceDate: i.invoiceDate, dueDate: i.dueDate, total: i.total, paidAmount: i.paidAmount,
        balanceDue: due, daysOverdue,
      };
    });

    const totalOf = (t: InvoiceType) => round2(rows.filter((r) => r.type === t).reduce((s, r) => s + r.balanceDue, 0));
    return {
      rows,
      buckets,
      totals: { receivable: totalOf(InvoiceType.SALE), payable: totalOf(InvoiceType.PURCHASE) },
    };
  }

  /** Every invoice, bill and payment in the range, newest first, with totals per kind. */
  async transactions(query: TransactionsQueryDto, user: AuthUser) {
    const kind = query.kind ?? 'all';
    const to = query.to ?? new Date().toISOString().slice(0, 10);
    const from = query.from ?? this.daysBefore(to, 29);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const scope = readScope(user);

    const wantInvoices = kind === 'all' || kind === 'sale' || kind === 'purchase';
    const wantPayments = kind === 'all' || kind === 'payment_in' || kind === 'payment_out';

    const invoices = wantInvoices
      ? await this.invoiceRepo.find({
          where: {
            invoiceDate: Between(from, to),
            status: Not(InvoiceStatus.CANCELLED),
            ...(kind === 'sale' || kind === 'purchase' ? { type: kind as InvoiceType } : {}),
            ...(scope ? { companyId: scope } : {}),
          },
          relations: { party: true },
        })
      : [];
    const payments = wantPayments
      ? await this.paymentRepo.find({
          where: {
            paymentDate: Between(from, to),
            ...(kind === 'payment_in' ? { direction: PaymentDirection.IN } : {}),
            ...(kind === 'payment_out' ? { direction: PaymentDirection.OUT } : {}),
            ...(scope ? { companyId: scope } : {}),
          },
          relations: { party: true },
        })
      : [];

    const rows = [
      ...invoices.map((i) => ({
        id: i.id, kind: i.type as string, date: i.invoiceDate, reference: i.invoiceNumber,
        partyName: i.party?.name ?? '—', amount: i.total, status: i.status as string,
        link: `/${i.type === InvoiceType.SALE ? 'sales' : 'purchases'}/${i.id}`,
      })),
      ...payments.map((p) => ({
        id: p.id, kind: p.direction === PaymentDirection.IN ? 'payment_in' : 'payment_out', date: p.paymentDate,
        reference: p.reference ?? p.method, partyName: p.party?.name ?? '—', amount: p.amount, status: 'recorded',
        link: '/payments',
      })),
    ].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

    const sumOf = (k: string) => round2(rows.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0));
    return {
      from, to, page, limit, total: rows.length,
      rows: rows.slice((page - 1) * limit, page * limit),
      totals: { sale: sumOf('sale'), purchase: sumOf('purchase'), paymentIn: sumOf('payment_in'), paymentOut: sumOf('payment_out') },
    };
  }

  stock(user: AuthUser, query: StockSummaryQueryDto = {}) {
    return this.itemsService.stockSummary(user, query);
  }

  private daysBefore(date: string, days: number): string {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
  }

  private diffDays(from: string, to: string): number {
    return Math.floor((Date.parse(to) - Date.parse(from)) / 86400000);
  }
}
