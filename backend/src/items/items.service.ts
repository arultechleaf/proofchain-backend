import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { Item } from './item.entity';
import { StockMovement, StockReason } from './stock-movement.entity';
import { ItemBranchStock } from './item-branch-stock.entity';
import { InvoiceLine } from '../invoices/invoice-line.entity';
import { QuotationLine } from '../quotations/quotation.entities';
import { Branch } from '../company-self/company-self.entities';
import { Company } from '../companies/company.entity';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateItemDto {
  @IsString() @MaxLength(150)
  name: string;

  @IsOptional() @IsString() @MaxLength(60)
  sku?: string;

  @IsOptional() @IsString() @MaxLength(20)
  hsnCode?: string;

  @IsOptional() @IsString() @MaxLength(20)
  unit?: string;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  salePrice?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  purchasePrice?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  taxRate?: number;

  /** Opening stock, recorded as the first stock movement (at `branchId`, or the default branch). */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  stock?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  lowStockLevel?: number;

  /** How much to order when the item runs low. */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  reorderQuantity?: number;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class AdjustStockDto {
  /** Positive to add stock, negative to remove it. */
  @IsNumber() @Type(() => Number)
  change: number;

  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;

  @IsOptional() @IsString() @MaxLength(100)
  note?: string;
}

export class TransferStockDto {
  @Type(() => Number) @IsInt()
  itemId: number;

  @Type(() => Number) @IsInt()
  fromBranchId: number;

  @Type(() => Number) @IsInt()
  toBranchId: number;

  @IsNumber() @Min(0.0001) @Type(() => Number)
  quantity: number;

  @IsOptional() @IsString() @MaxLength(100)
  note?: string;
}

export class StockReturnDto {
  @Type(() => Number) @IsInt()
  itemId: number;

  /** sale = a customer sends goods back (stock goes up); purchase = goods go back to the supplier (stock goes down). */
  @IsIn(['sale', 'purchase'])
  kind: 'sale' | 'purchase';

  @IsNumber() @Min(0.0001) @Type(() => Number)
  quantity: number;

  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;

  /** Invoice / bill number or any reference. */
  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;

  @IsOptional() @IsString() @MaxLength(100)
  note?: string;
}

export class StockEntryLineDto {
  @Type(() => Number) @IsInt()
  itemId: number;

  /** Positive adds stock, negative removes it. */
  @IsNumber() @Type(() => Number)
  change: number;
}

export class StockEntryDto {
  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;

  /** purchase = goods received without a bill (adds only); adjustment = a count correction; opening = first stock. */
  @IsIn(['purchase', 'adjustment', 'opening'])
  reason: 'purchase' | 'adjustment' | 'opening';

  @IsOptional() @IsString() @MaxLength(100)
  note?: string;

  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => StockEntryLineDto)
  lines: StockEntryLineDto[];
}

export class ItemQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  lowStock?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

export class StockSummaryQueryDto {
  /** Administrators and auditors can look at one company; everyone else always sees their own. */
  @IsOptional() @Type(() => Number) @IsInt()
  companyId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;
}

export class MovementQueryDto {
  @IsOptional() @Type(() => Number) @IsInt()
  itemId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  branchId?: number;

  @IsOptional() @Type(() => Number) @IsInt()
  companyId?: number;

  @IsOptional() @IsString() @MaxLength(30)
  reason?: string;

  @IsOptional() @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @IsOptional() @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  limit?: number = 25;
}

/** Reasons that may never take a branch below zero. */
const STRICT = new Set<StockReason>([StockReason.SALE, StockReason.TRANSFER_OUT, StockReason.ADJUSTMENT, StockReason.PURCHASE_RETURN]);

@Injectable()
export class ItemsService implements OnModuleInit {
  private readonly logger = new Logger(ItemsService.name);

  constructor(
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockMovement) private readonly moveRepo: Repository<StockMovement>,
    @InjectRepository(ItemBranchStock) private readonly stockRepo: Repository<ItemBranchStock>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Stock that existed before branches did is placed at each company's default branch (once; safe to repeat). */
  async onModuleInit() {
    try {
      const companyIds = new Set<number>();
      for (const r of await this.itemRepo.createQueryBuilder('i').select('DISTINCT i.companyId', 'c').getRawMany<{ c: number }>()) companyIds.add(Number(r.c));
      for (const companyId of companyIds) {
        const branch = await this.defaultBranch(companyId);
        const have = new Set((await this.stockRepo.find({ where: { companyId } })).map((s) => s.itemId));
        const items = await this.itemRepo.find({ where: { companyId } });
        const missing = items.filter((i) => !have.has(i.id));
        if (missing.length) {
          await this.stockRepo.save(missing.map((i) => this.stockRepo.create({ companyId, itemId: i.id, branchId: branch.id, quantity: i.stock })));
          this.logger.log(`Placed the stock of ${missing.length} item(s) of company ${companyId} at branch ${branch.code}`);
        }
        await this.moveRepo.createQueryBuilder().update().set({ branchId: branch.id }).where('company_id = :companyId AND branch_id IS NULL', { companyId }).execute();
      }
    } catch (err) {
      this.logger.error(`Could not place existing stock at branches: ${(err as Error).message}`);
    }
  }

  // ── branches ──────────────────────────────────────────────────────────────

  /** The company's default branch, created (as "Main") the first time one is needed. */
  async defaultBranch(companyId: number, manager?: EntityManager): Promise<Branch> {
    const repo = manager ? manager.getRepository(Branch) : this.branchRepo;
    let b = (await repo.findOne({ where: { companyId, isDefault: true, isActive: true } })) ?? (await repo.findOne({ where: { companyId, isActive: true }, order: { id: 'ASC' } }));
    if (!b) b = await repo.save(repo.create({ companyId, name: 'Main', code: 'MAIN', kind: 'branch', isDefault: true, isActive: true }));
    if (!b.isDefault) {
      await repo.update({ companyId }, { isDefault: false });
      await repo.update({ id: b.id }, { isDefault: true });
      b.isDefault = true;
    }
    return b;
  }

  /** The branch to use: the one asked for (must belong to the company and be active) or the default. */
  async resolveBranch(companyId: number, branchId?: number | null, manager?: EntityManager, allowInactive = false): Promise<Branch> {
    if (!branchId) return this.defaultBranch(companyId, manager);
    const repo = manager ? manager.getRepository(Branch) : this.branchRepo;
    const b = await repo.findOne({ where: { id: branchId, companyId } });
    if (!b) throw new NotFoundException('Branch not found');
    if (!b.isActive && !allowInactive) throw new BadRequestException(`"${b.name}" is inactive`);
    return b;
  }

  /** How much of an item is at a branch. */
  async branchQuantity(itemId: number, branchId: number, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(ItemBranchStock) : this.stockRepo;
    return (await repo.findOne({ where: { itemId, branchId } }))?.quantity ?? 0;
  }

  // ── items ─────────────────────────────────────────────────────────────────

  async create(dto: CreateItemDto, user: AuthUser): Promise<Item> {
    const companyId = writeCompanyId(user);
    const item = await this.itemRepo.save(
      this.itemRepo.create({
        companyId,
        name: dto.name.trim(),
        sku: dto.sku ?? null,
        hsnCode: dto.hsnCode?.trim() || null,
        unit: dto.unit ?? 'pcs',
        salePrice: dto.salePrice ?? 0,
        purchasePrice: dto.purchasePrice ?? 0,
        taxRate: dto.taxRate ?? 0,
        stock: 0,
        lowStockLevel: dto.lowStockLevel ?? 0,
        reorderQuantity: dto.reorderQuantity ?? 0,
        description: dto.description ?? null,
      }),
    );
    if (dto.stock && dto.stock > 0) {
      await this.itemRepo.manager.transaction((m) =>
        this.moveStock(m, item.id, dto.stock!, StockReason.OPENING, 'Opening stock', user.id, dto.branchId));
    }
    await this.audit.log({
      actorId: user.id, action: 'ITEM_CREATED', resourceType: 'item', resourceId: item.id,
      details: { name: item.name },
    });
    return this.findById(item.id, user);
  }

  async findAll(query: ItemQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 500);
    const qb = this.itemRepo.createQueryBuilder('i').orderBy('i.name', 'ASC');

    const scope = readScope(user);
    if (scope) qb.andWhere('i.companyId = :scope', { scope });
    if (query.search) {
      qb.andWhere('(i.name LIKE :s OR i.sku LIKE :s)', { s: `%${query.search}%` });
    }
    if (query.lowStock === 'true') {
      qb.andWhere('i.stock <= i.lowStockLevel');
    }
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: number, user: AuthUser): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    assertAccess(item.companyId, user, 'Item');
    return item;
  }

  /** Delete an item that was never sold, bought or quoted. Otherwise it should be marked inactive. */
  async remove(id: number, user: AuthUser): Promise<void> {
    writeCompanyId(user);
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    assertAccess(item.companyId, user, 'Item');
    const manager = this.itemRepo.manager;
    const [invoiceLines, quotationLines] = await Promise.all([
      manager.count(InvoiceLine, { where: { itemId: id } }),
      manager.count(QuotationLine, { where: { itemId: id } }),
    ]);
    if (invoiceLines || quotationLines) {
      throw new BadRequestException(
        `"${item.name}" is used on ${invoiceLines} invoice line(s) and ${quotationLines} quotation line(s), so it cannot be deleted. Mark it inactive instead.`,
      );
    }
    await manager.transaction(async (m) => {
      await m.delete(StockMovement, { itemId: id });
      await m.delete(ItemBranchStock, { itemId: id });
      await m.remove(item);
    });
    await this.audit.log({ actorId: user.id, action: 'ITEM_DELETED', resourceType: 'item', resourceId: id, details: { name: item.name } });
  }

  async update(id: number, dto: UpdateItemDto, user: AuthUser): Promise<Item> {
    writeCompanyId(user);
    const item = await this.findById(id, user);
    // Stock changes go through movements so the history stays accurate.
    const { stock: _ignored, branchId: _branch, name, ...rest } = dto;
    if (name !== undefined) item.name = name.trim();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) (item as any)[key] = value;
    }
    const saved = await this.itemRepo.save(item);
    await this.audit.log({ actorId: user.id, action: 'ITEM_UPDATED', resourceType: 'item', resourceId: id });
    return saved;
  }

  // ── stock changes ─────────────────────────────────────────────────────────

  async adjustStock(id: number, dto: AdjustStockDto, user: AuthUser): Promise<Item> {
    writeCompanyId(user);
    const item = await this.findById(id, user);
    if (dto.change === 0) throw new BadRequestException('Change must not be zero');
    await this.itemRepo.manager.transaction((m) =>
      this.moveStock(m, id, dto.change, StockReason.ADJUSTMENT, dto.note ?? 'Manual adjustment', user.id, dto.branchId));
    await this.audit.log({
      actorId: user.id, action: 'STOCK_ADJUSTED', resourceType: 'item', resourceId: id,
      details: { change: dto.change, note: dto.note, branchId: dto.branchId },
    });
    return this.findById(item.id, user);
  }

  /** Move stock from one branch to another. The item's total does not change. */
  async transfer(dto: TransferStockDto, user: AuthUser) {
    const companyId = writeCompanyId(user);
    const item = await this.findById(dto.itemId, user);
    if (dto.fromBranchId === dto.toBranchId) throw new BadRequestException('Choose two different branches');
    await this.itemRepo.manager.transaction(async (m) => {
      const from = await this.resolveBranch(companyId, dto.fromBranchId, m);
      const to = await this.resolveBranch(companyId, dto.toBranchId, m);
      const note = dto.note?.trim();
      await this.moveStock(m, item.id, -dto.quantity, StockReason.TRANSFER_OUT, `To ${to.code}${note ? ` — ${note}` : ''}`, user.id, from.id);
      await this.moveStock(m, item.id, dto.quantity, StockReason.TRANSFER_IN, `From ${from.code}${note ? ` — ${note}` : ''}`, user.id, to.id);
    });
    await this.audit.log({
      actorId: user.id, action: 'STOCK_TRANSFERRED', resourceType: 'item', resourceId: item.id,
      details: { from: dto.fromBranchId, to: dto.toBranchId, quantity: dto.quantity },
    });
    return this.stockByBranch(item.id, user);
  }

  /** Goods coming back from a customer (stock up) or going back to a supplier (stock down). */
  async returnStock(dto: StockReturnDto, user: AuthUser) {
    writeCompanyId(user);
    const item = await this.findById(dto.itemId, user);
    const sale = dto.kind === 'sale';
    const ref = [dto.reference?.trim(), dto.note?.trim()].filter(Boolean).join(' — ') || (sale ? 'Sale return' : 'Purchase return');
    await this.itemRepo.manager.transaction((m) =>
      this.moveStock(m, item.id, sale ? dto.quantity : -dto.quantity, sale ? StockReason.SALE_RETURN : StockReason.PURCHASE_RETURN, ref, user.id, dto.branchId));
    await this.audit.log({
      actorId: user.id, action: sale ? 'SALE_RETURN_RECORDED' : 'PURCHASE_RETURN_RECORDED', resourceType: 'item', resourceId: item.id,
      details: { quantity: dto.quantity, reference: dto.reference },
    });
    return this.findById(item.id, user);
  }

  /** Several items at once at one branch: all lines are checked first, then applied together or not at all. */
  async stockEntry(dto: StockEntryDto, user: AuthUser) {
    const companyId = writeCompanyId(user);
    const reason = dto.reason === 'purchase' ? StockReason.PURCHASE : dto.reason === 'opening' ? StockReason.OPENING : StockReason.ADJUSTMENT;
    const seen = new Set<number>();
    for (const l of dto.lines) {
      if (l.change === 0) throw new BadRequestException('A line has no quantity');
      if (dto.reason !== 'adjustment' && l.change < 0) throw new BadRequestException('Only an adjustment can remove stock');
      if (seen.has(l.itemId)) throw new BadRequestException('An item appears twice');
      seen.add(l.itemId);
    }
    const note = dto.note?.trim() || (dto.reason === 'purchase' ? 'Stock received' : dto.reason === 'opening' ? 'Opening stock' : 'Stock entry');
    const applied = await this.itemRepo.manager.transaction(async (m) => {
      const branch = await this.resolveBranch(companyId, dto.branchId, m);
      for (const l of dto.lines) {
        const item = await m.findOne(Item, { where: { id: l.itemId } });
        if (!item) throw new NotFoundException(`Item ${l.itemId} not found`);
        assertAccess(item.companyId, user, 'Item');
        await this.moveStock(m, item.id, l.change, reason, note, user.id, branch.id);
      }
      return { branch: branch.name, lines: dto.lines.length };
    });
    await this.audit.log({ actorId: user.id, action: 'STOCK_ENTRY', resourceType: 'item', details: { reason: dto.reason, lines: dto.lines.length, branchId: dto.branchId } });
    return applied;
  }

  /**
   * Apply a stock change at one branch and record the movement. Callers pass their own manager
   * so invoice creation can do this inside the same transaction.
   */
  async moveStock(
    manager: EntityManager,
    itemId: number,
    change: number,
    reason: StockReason,
    reference: string | null,
    actorId: number | null,
    branchId?: number | null,
  ): Promise<void> {
    const locking = manager.queryRunner?.isTransactionActive ? { lock: { mode: 'pessimistic_write' as const } } : {};
    const item = await manager.findOneOrFail(Item, { where: { id: itemId }, ...locking });
    // reversing an old invoice must work even if its branch has been deactivated since
    const branch = await this.resolveBranch(item.companyId, branchId ?? undefined, manager, reason === StockReason.CANCELLED);
    const row = (await manager.findOne(ItemBranchStock, { where: { itemId, branchId: branch.id }, ...locking }))
      ?? manager.create(ItemBranchStock, { companyId: item.companyId, itemId, branchId: branch.id, quantity: 0 });
    const next = round2(row.quantity + change);
    if (next < 0 && STRICT.has(reason)) {
      throw new BadRequestException(`Only ${row.quantity} ${item.unit} of "${item.name}" at ${branch.name}`);
    }
    const before = item.stock;
    row.quantity = next;
    await manager.save(row);
    item.stock = round2(item.stock + change);
    await manager.save(item);
    await manager.save(
      manager.create(StockMovement, {
        companyId: item.companyId,
        itemId,
        branchId: branch.id,
        change,
        balanceAfter: item.stock,
        reason,
        reference,
        createdBy: actorId,
      }),
    );
    // tell the company when an item first drops to its alert level
    if (change < 0 && item.lowStockLevel > 0 && before > item.lowStockLevel && item.stock <= item.lowStockLevel) {
      void this.notifications.notifyCompany(item.companyId, {
        type: 'system',
        title: `Low stock: ${item.name}`,
        message: `${item.stock} ${item.unit} left (alert at ${item.lowStockLevel})${item.reorderQuantity ? `. Suggested order: ${item.reorderQuantity} ${item.unit}` : ''}.`,
        link: '/inventory',
      });
    }
  }

  // ── reading stock ─────────────────────────────────────────────────────────

  /** One item's quantity at every active branch of its company. */
  async stockByBranch(itemId: number, user: AuthUser) {
    const item = await this.findById(itemId, user);
    const [branches, rows] = await Promise.all([
      this.branchRepo.find({ where: { companyId: item.companyId }, order: { isDefault: 'DESC', name: 'ASC' } }),
      this.stockRepo.find({ where: { itemId } }),
    ]);
    const qty = new Map(rows.map((r) => [r.branchId, r.quantity]));
    return {
      itemId, total: item.stock, unit: item.unit,
      branches: branches.filter((b) => b.isActive || (qty.get(b.id) ?? 0) !== 0)
        .map((b) => ({ branchId: b.id, name: b.name, code: b.code, kind: b.kind, isDefault: b.isDefault, isActive: b.isActive, quantity: qty.get(b.id) ?? 0 })),
    };
  }

  private movementQuery(user: AuthUser, q: MovementQueryDto) {
    const qb = this.moveRepo.createQueryBuilder('m').leftJoinAndSelect('m.item', 'item').orderBy('m.createdAt', 'DESC').addOrderBy('m.id', 'DESC');
    const scope = readScope(user);
    if (scope) qb.andWhere('m.companyId = :scope', { scope });
    else if (q.companyId) qb.andWhere('m.companyId = :cid', { cid: q.companyId });
    if (q.itemId) qb.andWhere('m.itemId = :itemId', { itemId: q.itemId });
    if (q.branchId) qb.andWhere('m.branchId = :branchId', { branchId: q.branchId });
    if (q.reason) qb.andWhere('m.reason = :reason', { reason: q.reason });
    if (q.from) qb.andWhere('m.createdAt >= :from', { from: `${q.from} 00:00:00` });
    if (q.to) qb.andWhere('m.createdAt <= :to', { to: `${q.to} 23:59:59` });
    return qb;
  }

  private async withBranchNames<T extends { branchId: number | null }>(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.branchId).filter((x): x is number => x != null))];
    const names = new Map((ids.length ? await this.branchRepo.findBy({ id: In(ids) }) : []).map((b) => [b.id, `${b.name} (${b.code})`]));
    return rows.map((r) => ({ ...r, branchName: r.branchId != null ? names.get(r.branchId) ?? null : null }));
  }

  async movements(user: AuthUser, q: MovementQueryDto = {}) {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 25, 500);
    const [rows, total] = await this.movementQuery(user, q).skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data: await this.withBranchNames(rows), total, page, limit };
  }

  /** The same filtered list as a CSV file (all matching rows, newest first). */
  async movementsCsv(user: AuthUser, q: MovementQueryDto = {}): Promise<string> {
    const rows = await this.withBranchNames(await this.movementQuery(user, q).take(5000).getMany());
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Date', 'Item', 'SKU', 'Branch', 'Reason', 'Change', 'Balance after', 'Reference'];
    return [head.join(',')].concat(rows.map((m) => [
      new Date(m.createdAt).toISOString().replace('T', ' ').slice(0, 19), m.item?.name, m.item?.sku, m.branchName, m.reason, m.change, m.balanceAfter, m.reference,
    ].map(esc).join(','))).join('\r\n');
  }

  /** Stock value and low-stock overview for the inventory pages and reports, per company and per branch. */
  async stockSummary(user: AuthUser, q: StockSummaryQueryDto = {}) {
    const scope = readScope(user);
    const companyId = scope ?? q.companyId;
    const [items, branches, stockRows, companies] = await Promise.all([
      this.itemRepo.find({ where: companyId ? { companyId } : {}, order: { name: 'ASC' } }),
      this.branchRepo.find({ where: companyId ? { companyId } : {}, order: { isDefault: 'DESC', name: 'ASC' } }),
      this.stockRepo.find({ where: companyId ? { companyId } : {} }),
      scope ? Promise.resolve([] as Company[]) : this.companyRepo.find(),
    ]);
    const byItem = new Map<number, Map<number, number>>();
    for (const r of stockRows) {
      if (!byItem.has(r.itemId)) byItem.set(r.itemId, new Map());
      byItem.get(r.itemId)!.set(r.branchId, r.quantity);
    }
    const companyName = new Map(companies.map((c) => [c.id, c.name]));
    const shown = items.map((i) => {
      const perBranch = byItem.get(i.id) ?? new Map<number, number>();
      const stock = q.branchId ? perBranch.get(q.branchId) ?? 0 : i.stock;
      return {
        ...i, stock, totalStock: i.stock,
        companyName: companyName.get(i.companyId) ?? null,
        branchStock: [...perBranch.entries()].map(([branchId, quantity]) => ({ branchId, quantity })),
        lowStock: stock <= i.lowStockLevel,
      };
    });
    const active = shown.filter((i) => i.isActive);
    const priceOf = new Map(items.map((i) => [i.id, i]));
    return {
      items: shown,
      totals: {
        itemCount: active.length,
        stockValue: round2(active.reduce((s, i) => s + i.stock * i.purchasePrice, 0)),
        retailValue: round2(active.reduce((s, i) => s + i.stock * i.salePrice, 0)),
        lowStockCount: active.filter((i) => i.lowStock).length,
      },
      branches: branches.map((b) => {
        const mine = stockRows.filter((r) => r.branchId === b.id && (priceOf.get(r.itemId)?.isActive ?? false));
        return {
          id: b.id, name: b.name, code: b.code, kind: b.kind, isDefault: b.isDefault, isActive: b.isActive, companyId: b.companyId,
          itemCount: mine.filter((r) => r.quantity > 0).length,
          stockValue: round2(mine.reduce((s, r) => s + r.quantity * (priceOf.get(r.itemId)?.purchasePrice ?? 0), 0)),
          retailValue: round2(mine.reduce((s, r) => s + r.quantity * (priceOf.get(r.itemId)?.salePrice ?? 0), 0)),
        };
      }),
      companies: companies.map((c) => ({ id: c.id, name: c.name })),
    };
  }
}
