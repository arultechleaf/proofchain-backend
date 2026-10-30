import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, Max, ValidateNested, IsBoolean, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompanySettings } from '../company-self/company-self.entities';
import { Invoice, InvoiceStatus, InvoiceType } from './invoice.entity';
import { InvoiceLine } from './invoice-line.entity';
import { Party } from '../parties/party.entity';
import { Item } from '../items/item.entity';
import { StockReason } from '../items/stock-movement.entity';
import { ItemsService } from '../items/items.service';
import {
  BlockchainTransaction, BlockchainTxStatus, BlockchainTxType,
} from '../blockchain/blockchain-transaction.entity';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuditService } from '../audit/audit.service';
import { Company } from '../companies/company.entity';
import { PaymentsService } from '../payments/payments.service';
import { PaymentDirection } from '../payments/payment.entity';
import { LineCalc, calcLine, calcTotals, supplyKind } from './gst';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class InvoiceLineDto {
  @IsOptional() @Type(() => Number) @IsInt()
  itemId?: number;

  /** Defaults to the item name when an item is chosen. */
  @IsOptional() @IsString() @MaxLength(255)
  description?: string;

  @IsNumber() @Min(0.0001) @Type(() => Number)
  quantity: number;

  /** Defaults to the item's sale/purchase price when an item is chosen. */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  rate?: number;

  /** Defaults to the item's tax rate when an item is chosen. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  taxRate?: number;

  /** Defaults to the item's SKU. */
  @IsOptional() @IsString() @MaxLength(60)
  sku?: string;

  /** HSN (goods) or SAC (services) code; defaults to the item's. */
  @IsOptional() @IsString() @MaxLength(20)
  hsnCode?: string;

  /** Defaults to the item's unit. */
  @IsOptional() @IsString() @MaxLength(20)
  unit?: string;

  @IsOptional() @IsIn(['amount', 'percent'])
  discountType?: 'amount' | 'percent';

  /** A flat amount or a percentage, depending on discountType. */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  discountValue?: number;
}

export class CreateInvoiceDto {
  @Type(() => Number) @IsInt()
  partyId: number;

  @IsOptional() @IsString() @MaxLength(50)
  invoiceNumber?: string;

  /** The branch / godown the stock moves at; the company's default branch when left out. */
  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'invoiceDate must be YYYY-MM-DD' })
  invoiceDate?: string;

  @IsOptional() @Matches(ISO_DATE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  discount?: number;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  /** cash, upi, bank, or credit (pay later). Defaults to credit. */
  @IsOptional() @IsIn(['cash', 'upi', 'bank', 'credit'])
  paymentType?: 'cash' | 'upi' | 'bank' | 'credit';

  /** Money taken at billing; recorded as a payment against this invoice. */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  amountReceived?: number;

  @IsOptional() @IsString() @MaxLength(30)
  customerMobile?: string;

  @IsOptional() @Matches(/^([0-9A-Za-z]{15})?$/, { message: 'customerGstin must be 15 letters/digits' })
  customerGstin?: string;

  @IsOptional() @IsString() @MaxLength(500)
  billingAddress?: string;

  /** Two-digit state code. Defaults to the state in the customer's GSTIN. */
  @IsOptional() @Matches(/^(\d{2})?$/, { message: 'placeOfSupply must be a two-digit state code' })
  placeOfSupply?: string;

  /** Round the grand total to the nearest rupee. */
  @IsOptional() @IsBoolean()
  roundOff?: boolean;
}

export class InvoiceQueryDto {
  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  search?: string;

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

const NUMBER_PREFIX: Record<InvoiceType, string> = {
  [InvoiceType.SALE]: 'INV',
  [InvoiceType.PURCHASE]: 'BILL',
};

/** True for a unique-index violation from MySQL or SQLite. */
function isDuplicateKey(err: unknown): boolean {
  const e = err as { code?: string; errno?: number; driverError?: { code?: string; errno?: number }; message?: string };
  const code = e?.code ?? e?.driverError?.code;
  const errno = e?.errno ?? e?.driverError?.errno;
  return code === 'ER_DUP_ENTRY' || errno === 1062 || /SQLITE_CONSTRAINT/.test(code ?? '') || /UNIQUE constraint failed/i.test(e?.message ?? '');
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Party) private readonly partyRepo: Repository<Party>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(BlockchainTransaction) private readonly txRepo: Repository<BlockchainTransaction>,
    private readonly itemsService: ItemsService,
    private readonly blockchain: BlockchainService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(CompanySettings) private readonly settingsRepo: Repository<CompanySettings>,
    private readonly payments: PaymentsService,
  ) {}

  async create(type: InvoiceType, dto: CreateInvoiceDto, user: AuthUser): Promise<Invoice> {
    const companyId = writeCompanyId(user);

    const party = await this.partyRepo.findOne({ where: { id: dto.partyId } });
    if (!party || party.companyId !== companyId) throw new BadRequestException('Party not found');

    const manualNumber = dto.invoiceNumber?.trim();
    let invoiceNumber = manualNumber || (await this.nextNumber(companyId, type));
    const duplicate = await this.invoiceRepo.findOne({ where: { companyId, type, invoiceNumber } });
    if (duplicate) throw new ConflictException(`Invoice number ${invoiceNumber} already exists`);

    // Resolve lines against the item catalogue and work out GST line by line.
    const items = new Map<number, Item>();
    const lines: Array<Partial<InvoiceLine>> = [];
    const calcs: LineCalc[] = [];

    for (const [index, l] of dto.lines.entries()) {
      let item: Item | null = null;
      if (l.itemId) {
        item = await this.itemRepo.findOne({ where: { id: l.itemId } });
        if (!item || item.companyId !== companyId) throw new BadRequestException(`Item on line ${index + 1} not found`);
        items.set(item.id, item);
      }
      const description = l.description?.trim() || item?.name;
      if (!description) throw new BadRequestException(`Line ${index + 1} needs a description or an item`);

      const rate = l.rate ?? (item ? (type === InvoiceType.SALE ? item.salePrice : item.purchasePrice) : undefined);
      if (rate === undefined) throw new BadRequestException(`Line ${index + 1} needs a rate`);
      const taxRate = l.taxRate ?? item?.taxRate ?? 0;

      const calc = calcLine({ quantity: l.quantity, rate, taxRate, discountType: l.discountType, discountValue: l.discountValue });
      if ('error' in calc) throw new BadRequestException(`Line ${index + 1}: ${calc.error}`);
      calcs.push(calc);
      lines.push({
        position: index, itemId: item?.id ?? null, description, quantity: l.quantity, rate, taxRate, amount: calc.amount,
        sku: l.sku?.trim() || item?.sku || null,
        hsnCode: l.hsnCode?.trim() || item?.hsnCode || null,
        unit: l.unit?.trim() || item?.unit || null,
        discountType: calc.discountAmount > 0 ? (l.discountType ?? 'amount') : null,
        discountValue: l.discountValue ?? 0,
        discountAmount: calc.discountAmount,
        taxableAmount: calc.taxableAmount,
        gstAmount: calc.gstAmount,
        lineTotal: calc.lineTotal,
      });
    }

    // Selling more than the branch holds is blocked. Total demand per item across all lines.
    const branch = await this.itemsService.resolveBranch(companyId, dto.branchId);
    if (type === InvoiceType.SALE) {
      const demand = new Map<number, number>();
      for (const l of lines) if (l.itemId) demand.set(l.itemId, (demand.get(l.itemId) ?? 0) + l.quantity!);
      for (const [itemId, qty] of demand) {
        const item = items.get(itemId)!;
        const here = await this.itemsService.branchQuantity(itemId, branch.id);
        if (here < qty) {
          throw new BadRequestException(`Only ${here} ${item.unit} of "${item.name}" at ${branch.name} (need ${qty})`);
        }
      }
    }

    // CGST + SGST inside one state, IGST between states (decided from the two GSTINs / place of supply).
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    const customerGstin = (dto.customerGstin ?? party.taxId ?? '').trim().toUpperCase() || null;
    const kind = supplyKind(company?.gstin, customerGstin, dto.placeOfSupply);
    const totals = calcTotals(calcs, kind, { extraDiscount: dto.discount, roundOff: dto.roundOff });
    if ('error' in totals) throw new BadRequestException(totals.error);
    const { subtotal, taxTotal, discount, total } = totals;

    const paymentType = dto.paymentType ?? 'credit';
    const received = round2(dto.amountReceived ?? 0);
    if (paymentType === 'credit' && received > 0) {
      throw new BadRequestException('A credit invoice has nothing received at billing. Choose cash, UPI or bank, or record the payment later.');
    }
    if (received > total) throw new BadRequestException(`Amount received (${received}) cannot be more than the grand total (${total})`);

    const invoiceDate = dto.invoiceDate ?? new Date().toISOString().slice(0, 10);

    const persist = () => this.invoiceRepo.manager.transaction(async (manager) => {
      const invoice = await manager.save(
        manager.create(Invoice, {
          companyId, type, invoiceNumber, partyId: party.id, invoiceDate,
          dueDate: dto.dueDate ?? null, subtotal, taxTotal, discount, total,
          taxableValue: totals.taxableValue, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, roundOff: totals.roundOff,
          paymentType, customerMobile: dto.customerMobile?.trim() || party.phone || null, customerGstin,
          billingAddress: dto.billingAddress?.trim() || party.address || null,
          placeOfSupply: dto.placeOfSupply?.trim() || (customerGstin && /^\d{2}/.test(customerGstin) ? customerGstin.slice(0, 2) : null),
          paidAmount: 0, status: InvoiceStatus.ISSUED, notes: dto.notes ?? null, createdBy: user.id, branchId: branch.id,
        }),
      );
      await manager.save(lines.map((l) => manager.create(InvoiceLine, { ...l, invoiceId: invoice.id })));

      for (const l of lines) {
        if (!l.itemId) continue;
        const sale = type === InvoiceType.SALE;
        await this.itemsService.moveStock(
          manager, l.itemId, sale ? -l.quantity! : l.quantity!,
          sale ? StockReason.SALE : StockReason.PURCHASE, invoiceNumber, user.id, branch.id,
        );
      }
      if (received > 0) {
        await this.payments.record(
          companyId,
          {
            partyId: party.id,
            invoiceId: invoice.id,
            direction: type === InvoiceType.SALE ? PaymentDirection.IN : PaymentDirection.OUT,
            amount: received,
            method: paymentType,
            paymentDate: invoiceDate,
            reference: invoiceNumber,
            notes: 'Taken at billing',
          },
          user.id,
          manager,
        );
      }
      return invoice;
    });

    // Two people saving at the same moment can be handed the same automatic number; the unique
    // index rejects the second one and the whole transaction rolls back, so just take the next number.
    let saved: Invoice;
    for (let attempt = 0; ; attempt++) {
      try {
        saved = await persist();
        break;
      } catch (err) {
        if (manualNumber || attempt >= 12 || !isDuplicateKey(err)) throw err;
        // A short random pause stops several losers retrying in lockstep and colliding again.
        await new Promise((r) => setTimeout(r, 20 + Math.floor(Math.random() * 60)));
        invoiceNumber = await this.nextNumber(companyId, type);
      }
    }

    await this.registerOnChain(saved.id);
    await this.audit.log({
      actorId: user.id,
      action: type === InvoiceType.SALE ? 'INVOICE_CREATED' : 'BILL_CREATED',
      resourceType: 'invoice', resourceId: saved.id,
      details: { invoiceNumber, total, partyId: party.id },
    });
    await this.notifications.notifyCompany(companyId, {
      type: 'invoice',
      title: type === InvoiceType.SALE ? 'Invoice created' : 'Bill created',
      message: `${invoiceNumber} for ${party.name} (${total}) was created by ${user.name}.`,
      link: `/${type === InvoiceType.SALE ? 'sales' : 'purchases'}/${saved.id}`,
    }, user.id);
    return this.findById(saved.id, user);
  }

  async findAll(query: InvoiceQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 200);
    const qb = this.invoiceRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.party', 'party')
      .orderBy('i.invoiceDate', 'DESC')
      .addOrderBy('i.createdAt', 'DESC');

    const scope = readScope(user);
    if (scope) qb.andWhere('i.companyId = :scope', { scope });
    if (query.type) qb.andWhere('i.type = :type', { type: query.type });
    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.partyId) qb.andWhere('i.partyId = :partyId', { partyId: query.partyId });
    if (query.from) qb.andWhere('i.invoiceDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('i.invoiceDate <= :to', { to: query.to });
    if (query.search) {
      qb.andWhere('(i.invoiceNumber LIKE :s OR party.name LIKE :s)', { s: `%${query.search}%` });
    }
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: number, user: AuthUser): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id }, relations: { party: true, lines: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    assertAccess(invoice.companyId, user, 'Invoice');
    invoice.lines.sort((a, b) => a.position - b.position);
    return invoice;
  }

  /** Invoice with its blockchain transaction, for the detail page. */
  async getDetail(id: number, user: AuthUser) {
    const invoice = await this.findById(id, user);
    const transaction = invoice.blockchainTransactionId
      ? await this.txRepo.findOne({ where: { id: invoice.blockchainTransactionId } })
      : null;
    return { ...invoice, transaction };
  }

  async cancel(id: number, user: AuthUser): Promise<Invoice> {
    writeCompanyId(user);
    const invoice = await this.findById(id, user);
    if (invoice.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Invoice is already cancelled');
    if (invoice.paidAmount > 0) {
      throw new BadRequestException('Invoices with payments cannot be cancelled');
    }

    await this.invoiceRepo.manager.transaction(async (manager) => {
      for (const l of invoice.lines) {
        if (!l.itemId) continue;
        // Undo the original movement: sales put stock back, purchases take it out again.
        const sale = invoice.type === InvoiceType.SALE;
        await this.itemsService.moveStock(
          manager, l.itemId, sale ? l.quantity : -l.quantity, StockReason.CANCELLED, invoice.invoiceNumber, user.id, invoice.branchId,
        );
      }
      invoice.status = InvoiceStatus.CANCELLED;
      await manager.save(invoice);
    });

    await this.audit.log({
      actorId: user.id, action: 'INVOICE_CANCELLED', resourceType: 'invoice', resourceId: id,
      details: { invoiceNumber: invoice.invoiceNumber },
    });
    return this.findById(id, user);
  }

  /** Re-hash the stored invoice and compare with the registered proof. */
  async verify(id: number, user: AuthUser) {
    const invoice = await this.findById(id, user);
    const { hexHash: calculatedHash, bytes32Hash } = this.hashOf(invoice);
    const expectedHash = invoice.payloadHash;
    const hashMatch = !!expectedHash && expectedHash === calculatedHash;

    const tx = invoice.blockchainTransactionId
      ? await this.txRepo.findOne({ where: { id: invoice.blockchainTransactionId } })
      : null;
    const onChain = await this.blockchain.verifyProofOnChain(invoice.id, bytes32Hash);

    let status: 'verified' | 'mismatch' | 'not_found' | 'pending';
    if (!expectedHash || !tx) status = 'not_found';
    else if (!hashMatch) status = 'mismatch';
    else if (this.blockchain.mode === 'demo') status = 'verified';
    else if (onChain.error) status = 'pending';
    else status = onChain.matches ? 'verified' : 'mismatch';

    await this.audit.log({
      actorId: user.id, action: 'VERIFY_INVOICE', resourceType: 'invoice', resourceId: id,
      details: { status, hashMatch },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status,
      expectedHash,
      calculatedHash,
      hashMatch,
      blockchainRecord: {
        transactionHash: tx?.transactionHash ?? null,
        blockNumber: tx?.blockNumber ?? null,
        contractAddress: tx?.contractAddress ?? null,
        onChainMatch: onChain.matches ?? false,
        error: onChain.error,
      },
      verifiedAt: new Date().toISOString(),
      blockchainMode: this.blockchain.mode,
    };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private hashOf(invoice: Invoice) {
    return this.blockchain.computeInvoiceHash({
      invoiceId: invoice.id,
      type: invoice.type,
      invoiceNumber: invoice.invoiceNumber,
      companyId: invoice.companyId,
      partyId: invoice.partyId,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      lines: invoice.lines,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      discount: invoice.discount,
      total: invoice.total,
      gst: invoice.taxableValue == null ? undefined : {
        taxableValue: invoice.taxableValue, cgst: invoice.cgst, sgst: invoice.sgst, igst: invoice.igst, roundOff: invoice.roundOff,
      },
    });
  }

  /** Hash the invoice and register the hash on-chain (simulated in demo mode). */
  private async registerOnChain(invoiceId: number): Promise<void> {
    const invoice = await this.invoiceRepo.findOneOrFail({ where: { id: invoiceId }, relations: { lines: true } });
    invoice.lines.sort((a, b) => a.position - b.position);
    const { hexHash, bytes32Hash, canonicalPayload } = this.hashOf(invoice);

    const dbTx = await this.txRepo.save(
      this.txRepo.create({
        deliveryId: null,
        invoiceId,
        transactionType: BlockchainTxType.PROOF_REGISTRATION,
        status: BlockchainTxStatus.PENDING,
        contractAddress: null,
      }),
    );
    const tx = await this.blockchain.registerProof(invoiceId, bytes32Hash, dbTx);

    await this.invoiceRepo.update(invoiceId, {
      payloadHash: hexHash,
      canonicalPayload,
      blockchainTransactionId: tx.id,
      blockchainStatus: tx.status === BlockchainTxStatus.CONFIRMED ? 'confirmed' : tx.status,
    });
  }

  /** The number the next document of this type will get, for the "new invoice" form. */
  async previewNextNumber(type: InvoiceType, user: AuthUser): Promise<{ invoiceNumber: string; type: InvoiceType; sellerGstin: string | null }> {
    const companyId = writeCompanyId(user);
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    // The seller's GSTIN lets the form work out CGST + SGST versus IGST while the user types.
    return { invoiceNumber: await this.nextNumber(companyId, type), type, sellerGstin: company?.gstin ?? null };
  }

  /**
   * PREFIX-YEAR-0001, counting on from the highest number already used this year (so deleting or
   * cancelling a document never makes a number repeat), and starting again at 0001 each year.
   */
  private async nextNumber(companyId: number, type: InvoiceType): Promise<string> {
    const year = new Date().getFullYear();
    // each company can choose its own prefix (My company > Bank & invoice settings); INV / BILL until it does
    const settings = await this.settingsRepo.findOne({ where: { companyId } });
    const chosen = type === InvoiceType.SALE ? settings?.salesPrefix : settings?.purchasePrefix;
    const prefix = `${chosen || NUMBER_PREFIX[type]}-${year}-`;
    const rows = await this.invoiceRepo
      .createQueryBuilder('i')
      .select('i.invoiceNumber', 'invoiceNumber')
      .where('i.companyId = :companyId AND i.type = :type AND i.invoiceNumber LIKE :like', { companyId, type, like: `${prefix}%` })
      .getRawMany<{ invoiceNumber: string }>();
    const highest = rows.reduce((max, r) => {
      const n = Number(r.invoiceNumber.slice(prefix.length));
      return Number.isInteger(n) && n > max ? n : max;
    }, 0);
    for (let n = highest + 1; ; n++) {
      const candidate = `${prefix}${String(n).padStart(4, '0')}`;
      const taken = await this.invoiceRepo.findOne({ where: { companyId, type, invoiceNumber: candidate } });
      if (!taken) return candidate;
    }
  }
}
