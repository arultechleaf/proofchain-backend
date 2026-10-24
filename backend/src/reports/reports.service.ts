import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { Invoice, InvoiceStatus, InvoiceType } from '../invoices/invoice.entity';
import { ItemsService } from '../items/items.service';
import { AuthUser, readScope, round2 } from '../common/tenant';

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

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
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
    const parties = new Map<string, { partyId: string; name: string; total: number; count: number }>();
    const items = new Map<string, { description: string; quantity: number; amount: number }>();

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

  stock(user: AuthUser) {
    return this.itemsService.stockSummary(user);
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
