import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class InvoiceLineDto {
  @IsOptional() @IsUUID()
  itemId?: string;

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
}

export class CreateInvoiceDto {
  @IsUUID()
  partyId: string;

  @IsOptional() @IsString() @MaxLength(50)
  invoiceNumber?: string;

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
}

export class InvoiceQueryDto {
  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  search?: string;

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

const NUMBER_PREFIX: Record<InvoiceType, string> = {
  [InvoiceType.SALE]: 'INV',
  [InvoiceType.PURCHASE]: 'BILL',
};

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
  ) {}

  async create(type: InvoiceType, dto: CreateInvoiceDto, user: AuthUser): Promise<Invoice> {
    const companyId = writeCompanyId(user);

    const party = await this.partyRepo.findOne({ where: { id: dto.partyId } });
    if (!party || party.companyId !== companyId) throw new BadRequestException('Party not found');

    const invoiceNumber = dto.invoiceNumber?.trim() || (await this.nextNumber(companyId, type));
    const duplicate = await this.invoiceRepo.findOne({ where: { companyId, type, invoiceNumber } });
    if (duplicate) throw new ConflictException(`Invoice number ${invoiceNumber} already exists`);

    // Resolve lines against the item catalogue and compute totals.
    const items = new Map<string, Item>();
    const lines: Array<Partial<InvoiceLine>> = [];
    let subtotal = 0;
    let taxTotal = 0;

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

      const amount = round2(l.quantity * rate);
      subtotal += amount;
      taxTotal += round2((amount * taxRate) / 100);
      lines.push({
        position: index, itemId: item?.id ?? null, description, quantity: l.quantity, rate, taxRate, amount,
      });
    }

    // Selling more than is in stock is blocked. Total demand per item across all lines.
    if (type === InvoiceType.SALE) {
      const demand = new Map<string, number>();
      for (const l of lines) if (l.itemId) demand.set(l.itemId, (demand.get(l.itemId) ?? 0) + l.quantity!);
      for (const [itemId, qty] of demand) {
        const item = items.get(itemId)!;
        if (item.stock < qty) {
          throw new BadRequestException(`Only ${item.stock} ${item.unit} of "${item.name}" in stock (need ${qty})`);
        }
      }
    }

    subtotal = round2(subtotal);
    taxTotal = round2(taxTotal);
    const discount = round2(dto.discount ?? 0);
    if (discount > subtotal + taxTotal) throw new BadRequestException('Discount cannot exceed the invoice total');
    const total = round2(subtotal + taxTotal - discount);

    const invoiceDate = dto.invoiceDate ?? new Date().toISOString().slice(0, 10);

    const saved = await this.invoiceRepo.manager.transaction(async (manager) => {
      const invoice = await manager.save(
        manager.create(Invoice, {
          companyId, type, invoiceNumber, partyId: party.id, invoiceDate,
          dueDate: dto.dueDate ?? null, subtotal, taxTotal, discount, total,
          paidAmount: 0, status: InvoiceStatus.ISSUED, notes: dto.notes ?? null, createdBy: user.id,
        }),
      );
      await manager.save(lines.map((l) => manager.create(InvoiceLine, { ...l, invoiceId: invoice.id })));

      for (const l of lines) {
        if (!l.itemId) continue;
        const sale = type === InvoiceType.SALE;
        await this.itemsService.moveStock(
          manager, l.itemId, sale ? -l.quantity! : l.quantity!,
          sale ? StockReason.SALE : StockReason.PURCHASE, invoiceNumber, user.id,
        );
      }
      return invoice;
    });

    await this.registerOnChain(saved.id);
    await this.audit.log({
      actorId: user.id,
      action: type === InvoiceType.SALE ? 'INVOICE_CREATED' : 'BILL_CREATED',
      resourceType: 'invoice', resourceId: saved.id,
      details: { invoiceNumber, total, partyId: party.id },
    });
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

  async findById(id: string, user: AuthUser): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id }, relations: { party: true, lines: true } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    assertAccess(invoice.companyId, user, 'Invoice');
    invoice.lines.sort((a, b) => a.position - b.position);
    return invoice;
  }

  /** Invoice with its blockchain transaction, for the detail page. */
  async getDetail(id: string, user: AuthUser) {
    const invoice = await this.findById(id, user);
    const transaction = invoice.blockchainTransactionId
      ? await this.txRepo.findOne({ where: { id: invoice.blockchainTransactionId } })
      : null;
    return { ...invoice, transaction };
  }

  async cancel(id: string, user: AuthUser): Promise<Invoice> {
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
          manager, l.itemId, sale ? l.quantity : -l.quantity, StockReason.CANCELLED, invoice.invoiceNumber, user.id,
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
  async verify(id: string, user: AuthUser) {
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
    });
  }

  /** Hash the invoice and register the hash on-chain (simulated in demo mode). */
  private async registerOnChain(invoiceId: string): Promise<void> {
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

  private async nextNumber(companyId: string, type: InvoiceType): Promise<string> {
    const count = await this.invoiceRepo.count({ where: { companyId, type } });
    const year = new Date().getFullYear();
    for (let n = count + 1; ; n++) {
      const candidate = `${NUMBER_PREFIX[type]}-${year}-${String(n).padStart(4, '0')}`;
      const taken = await this.invoiceRepo.findOne({ where: { companyId, type, invoiceNumber: candidate } });
      if (!taken) return candidate;
    }
  }
}
