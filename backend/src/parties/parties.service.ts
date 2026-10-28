import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IsBoolean, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { Party, PartyType } from './party.entity';
import { Invoice, InvoiceStatus, InvoiceType } from '../invoices/invoice.entity';
import { Payment, PaymentDirection } from '../payments/payment.entity';
import { Quotation } from '../quotations/quotation.entities';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';
import { AuditService } from '../audit/audit.service';

export class CreatePartyDto {
  @IsString() @MaxLength(150)
  name: string;

  @IsOptional() @IsEnum(PartyType)
  partyType?: PartyType;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(50)
  taxId?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  openingBalance?: number;
}

export class UpdatePartyDto extends PartialType(CreatePartyDto) {
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class PartyQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(Party) private readonly partyRepo: Repository<Party>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreatePartyDto, user: AuthUser): Promise<Party> {
    const party = this.partyRepo.create({
      companyId: writeCompanyId(user),
      name: dto.name.trim(),
      partyType: dto.partyType ?? PartyType.CUSTOMER,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      taxId: dto.taxId ?? null,
      address: dto.address ?? null,
      city: dto.city ?? null,
      openingBalance: dto.openingBalance ?? 0,
    });
    const saved = await this.partyRepo.save(party);
    await this.audit.log({
      actorId: user.id, action: 'PARTY_CREATED', resourceType: 'party', resourceId: saved.id,
      details: { name: saved.name, partyType: saved.partyType },
    });
    return saved;
  }

  async findAll(query: PartyQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 200);
    const qb = this.partyRepo.createQueryBuilder('p').orderBy('p.name', 'ASC');

    const scope = readScope(user);
    if (scope) qb.andWhere('p.companyId = :scope', { scope });
    if (query.type === 'customer' || query.type === 'supplier') {
      // "both" parties appear in either list
      qb.andWhere('p.partyType IN (:...types)', { types: [query.type, PartyType.BOTH] });
    }
    if (query.search) {
      qb.andWhere('(p.name LIKE :s OR p.phone LIKE :s OR p.email LIKE :s)', { s: `%${query.search}%` });
    }
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: string, user: AuthUser): Promise<Party> {
    const party = await this.partyRepo.findOne({ where: { id } });
    if (!party) throw new NotFoundException('Party not found');
    assertAccess(party.companyId, user, 'Party');
    return party;
  }

  /** Delete a customer/supplier that has no documents. Otherwise it should be marked inactive. */
  async remove(id: string, user: AuthUser): Promise<void> {
    writeCompanyId(user);
    const party = await this.findById(id, user);
    const [invoices, payments, quotations] = await Promise.all([
      this.invoiceRepo.count({ where: { partyId: id } }),
      this.paymentRepo.count({ where: { partyId: id } }),
      this.partyRepo.manager.count(Quotation, { where: { partyId: id } }),
    ]);
    if (invoices || payments || quotations) {
      throw new BadRequestException(
        `"${party.name}" has ${invoices} invoice(s), ${payments} payment(s) and ${quotations} quotation(s), so it cannot be deleted. Mark it inactive instead.`,
      );
    }
    await this.partyRepo.remove(party);
    await this.audit.log({ actorId: user.id, action: 'PARTY_DELETED', resourceType: 'party', resourceId: id, details: { name: party.name } });
  }

  async update(id: string, dto: UpdatePartyDto, user: AuthUser): Promise<Party> {
    writeCompanyId(user);
    const party = await this.findById(id, user);
    const { name, ...rest } = dto;
    if (name !== undefined) party.name = name.trim();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) (party as any)[key] = value;
    }
    const saved = await this.partyRepo.save(party);
    await this.audit.log({
      actorId: user.id, action: 'PARTY_UPDATED', resourceType: 'party', resourceId: id,
    });
    return saved;
  }

  /** Party details plus invoices, payments and the running balance. */
  async getLedger(id: string, user: AuthUser) {
    const party = await this.findById(id, user);
    const [invoices, payments] = await Promise.all([
      this.invoiceRepo.find({ where: { partyId: id }, order: { invoiceDate: 'DESC', createdAt: 'DESC' } }),
      this.paymentRepo.find({ where: { partyId: id }, order: { paymentDate: 'DESC', createdAt: 'DESC' } }),
    ]);
    return { party, invoices, payments, summary: this.summarize(party, invoices, payments) };
  }

  /** Receivable/payable figures for one party. Cancelled invoices are ignored. */
  summarize(party: Party, invoices: Invoice[], payments: Payment[]) {
    const live = invoices.filter((i) => i.status !== InvoiceStatus.CANCELLED);
    const totalSales = live.filter((i) => i.type === InvoiceType.SALE).reduce((s, i) => s + i.total, 0);
    const totalPurchases = live.filter((i) => i.type === InvoiceType.PURCHASE).reduce((s, i) => s + i.total, 0);
    const received = payments.filter((p) => p.direction === PaymentDirection.IN).reduce((s, p) => s + p.amount, 0);
    const paid = payments.filter((p) => p.direction === PaymentDirection.OUT).reduce((s, p) => s + p.amount, 0);
    // Positive: the party owes us. Negative: we owe the party.
    const balance = party.openingBalance + totalSales - received - (totalPurchases - paid);
    return {
      totalSales: round2(totalSales),
      totalPurchases: round2(totalPurchases),
      received: round2(received),
      paid: round2(paid),
      openingBalance: round2(party.openingBalance),
      balance: round2(balance),
    };
  }

  /** One row per party with balances — the "accounts" view. */
  async getAccounts(user: AuthUser) {
    const scope = readScope(user);
    const partyWhere = scope ? { companyId: scope } : {};
    const [parties, invoices, payments] = await Promise.all([
      this.partyRepo.find({ where: partyWhere, order: { name: 'ASC' } }),
      this.invoiceRepo.find({ where: partyWhere }),
      this.paymentRepo.find({ where: partyWhere }),
    ]);

    const rows = parties.map((p) => ({
      party: p,
      ...this.summarize(
        p,
        invoices.filter((i) => i.partyId === p.id),
        payments.filter((x) => x.partyId === p.id),
      ),
    }));
    const toReceive = rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
    const toPay = rows.filter((r) => r.balance < 0).reduce((s, r) => s + -r.balance, 0);
    return { rows, totals: { toReceive: round2(toReceive), toPay: round2(toPay) } };
  }
}
