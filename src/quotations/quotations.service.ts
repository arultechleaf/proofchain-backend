import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Quotation, QuotationLine, QuotationStatus } from './quotation.entities';
import { Party } from '../parties/party.entity';
import { Item } from '../items/item.entity';
import { InvoiceType } from '../invoices/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class QuotationLineDto {
  @IsOptional() @Type(() => Number) @IsInt()
  itemId?: number;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;

  @IsNumber() @Min(0.0001) @Type(() => Number)
  quantity: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  rate?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  taxRate?: number;
}

export class CreateQuotationDto {
  @Type(() => Number) @IsInt()
  partyId: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'quotationDate must be YYYY-MM-DD' })
  quotationDate?: string;

  @IsOptional() @Matches(ISO_DATE, { message: 'validUntil must be YYYY-MM-DD' })
  validUntil?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => QuotationLineDto)
  lines: QuotationLineDto[];

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  discount?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class UpdateQuotationStatusDto {
  @IsEnum([QuotationStatus.DRAFT, QuotationStatus.SENT, QuotationStatus.ACCEPTED, QuotationStatus.REJECTED])
  status: QuotationStatus;
}

export class QuotationQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Quotation) private readonly repo: Repository<Quotation>,
    @InjectRepository(Party) private readonly partyRepo: Repository<Party>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateQuotationDto, user: AuthUser): Promise<Quotation> {
    const companyId = writeCompanyId(user);
    const party = await this.partyRepo.findOne({ where: { id: dto.partyId } });
    if (!party || party.companyId !== companyId) throw new BadRequestException('Party not found');

    let subtotal = 0;
    let taxTotal = 0;
    const lines: Array<Partial<QuotationLine>> = [];
    for (const [index, l] of dto.lines.entries()) {
      const item = l.itemId ? await this.itemRepo.findOne({ where: { id: l.itemId } }) : null;
      if (l.itemId && (!item || item.companyId !== companyId)) throw new BadRequestException(`Item on line ${index + 1} not found`);
      const description = l.description?.trim() || item?.name;
      if (!description) throw new BadRequestException(`Line ${index + 1} needs a description or an item`);
      const rate = l.rate ?? item?.salePrice;
      if (rate === undefined) throw new BadRequestException(`Line ${index + 1} needs a rate`);
      const taxRate = l.taxRate ?? item?.taxRate ?? 0;
      const amount = round2(l.quantity * rate);
      subtotal += amount;
      taxTotal += round2((amount * taxRate) / 100);
      lines.push({ position: index, itemId: item?.id ?? null, description, quantity: l.quantity, rate, taxRate, amount });
    }
    subtotal = round2(subtotal);
    taxTotal = round2(taxTotal);
    const discount = round2(dto.discount ?? 0);
    if (discount > subtotal + taxTotal) throw new BadRequestException('Discount cannot exceed the quotation total');

    const quotation = await this.repo.save(
      this.repo.create({
        companyId, party, partyId: party.id,
        quotationNumber: await this.nextNumber(companyId),
        quotationDate: dto.quotationDate ?? new Date().toISOString().slice(0, 10),
        validUntil: dto.validUntil ?? null,
        subtotal, taxTotal, discount, total: round2(subtotal + taxTotal - discount),
        status: QuotationStatus.DRAFT, notes: dto.notes ?? null, createdBy: user.id,
        lines: lines.map((l) => Object.assign(new QuotationLine(), l)),
      }),
    );
    await this.audit.log({
      actorId: user.id, action: 'QUOTATION_CREATED', resourceType: 'quotation', resourceId: quotation.id,
      details: { quotationNumber: quotation.quotationNumber, total: quotation.total },
    });
    return this.findById(quotation.id, user);
  }

  async findAll(query: QuotationQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo.createQueryBuilder('q').leftJoinAndSelect('q.party', 'party')
      .orderBy('q.quotationDate', 'DESC').addOrderBy('q.createdAt', 'DESC');
    const scope = readScope(user);
    if (scope) qb.andWhere('q.companyId = :scope', { scope });
    if (query.status) qb.andWhere('q.status = :status', { status: query.status });
    if (query.search) qb.andWhere('(q.quotationNumber LIKE :s OR party.name LIKE :s)', { s: `%${query.search}%` });
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: number, user: AuthUser): Promise<Quotation> {
    const quotation = await this.repo.findOne({ where: { id }, relations: { party: true, lines: true } });
    if (!quotation) throw new NotFoundException('Quotation not found');
    assertAccess(quotation.companyId, user, 'Quotation');
    quotation.lines.sort((a, b) => a.position - b.position);
    return quotation;
  }

  async setStatus(id: number, status: QuotationStatus, user: AuthUser): Promise<Quotation> {
    writeCompanyId(user);
    const quotation = await this.findById(id, user);
    if (quotation.status === QuotationStatus.CONVERTED) throw new BadRequestException('This quotation was already converted to an invoice');
    quotation.status = status;
    await this.repo.save(quotation);
    await this.audit.log({
      actorId: user.id, action: 'QUOTATION_STATUS', resourceType: 'quotation', resourceId: id,
      details: { quotationNumber: quotation.quotationNumber, status },
    });
    return this.findById(id, user);
  }

  /** Delete a quotation that has not been turned into an invoice. */
  async remove(id: number, user: AuthUser): Promise<void> {
    writeCompanyId(user);
    const quotation = await this.findById(id, user);
    if (quotation.status === QuotationStatus.CONVERTED) {
      throw new BadRequestException('This quotation was converted to an invoice, so it cannot be deleted');
    }
    await this.repo.remove(quotation);
    await this.audit.log({
      actorId: user.id, action: 'QUOTATION_DELETED', resourceType: 'quotation', resourceId: id,
      details: { quotationNumber: quotation.quotationNumber },
    });
  }

  /** Create a sales invoice from the quotation. Stock and number checks happen in the invoice service. */
  async convert(id: number, user: AuthUser) {
    writeCompanyId(user);
    const quotation = await this.findById(id, user);
    if (quotation.status === QuotationStatus.CONVERTED) throw new BadRequestException('This quotation was already converted');
    if (quotation.status === QuotationStatus.REJECTED) throw new BadRequestException('A rejected quotation cannot be converted');

    const invoice = await this.invoices.create(InvoiceType.SALE, {
      partyId: quotation.partyId,
      dueDate: quotation.validUntil ?? undefined,
      discount: quotation.discount,
      notes: `From quotation ${quotation.quotationNumber}${quotation.notes ? ` — ${quotation.notes}` : ''}`.slice(0, 1000),
      lines: quotation.lines.map((l) => ({
        itemId: l.itemId ?? undefined, description: l.description, quantity: l.quantity, rate: l.rate, taxRate: l.taxRate,
      })),
    }, user);

    quotation.status = QuotationStatus.CONVERTED;
    quotation.convertedInvoiceId = invoice.id;
    await this.repo.save(quotation);
    await this.audit.log({
      actorId: user.id, action: 'QUOTATION_CONVERTED', resourceType: 'quotation', resourceId: id,
      details: { quotationNumber: quotation.quotationNumber, invoiceNumber: invoice.invoiceNumber },
    });
    return { quotation: await this.findById(id, user), invoice };
  }

  private async nextNumber(companyId: number): Promise<string> {
    const count = await this.repo.count({ where: { companyId } });
    const year = new Date().getFullYear();
    for (let n = count + 1; ; n++) {
      const candidate = `QT-${year}-${String(n).padStart(4, '0')}`;
      if (!(await this.repo.findOne({ where: { companyId, quotationNumber: candidate } }))) return candidate;
    }
  }
}
