import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { Item } from './item.entity';
import { StockMovement, StockReason } from './stock-movement.entity';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';
import { AuditService } from '../audit/audit.service';

export class CreateItemDto {
  @IsString() @MaxLength(150)
  name: string;

  @IsOptional() @IsString() @MaxLength(60)
  sku?: string;

  @IsOptional() @IsString() @MaxLength(20)
  unit?: string;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  salePrice?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  purchasePrice?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(100) @Type(() => Number)
  taxRate?: number;

  /** Opening stock, recorded as the first stock movement. */
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  stock?: number;

  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  lowStockLevel?: number;

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

  @IsOptional() @IsString() @MaxLength(100)
  note?: string;
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

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockMovement) private readonly moveRepo: Repository<StockMovement>,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateItemDto, user: AuthUser): Promise<Item> {
    const companyId = writeCompanyId(user);
    const item = await this.itemRepo.save(
      this.itemRepo.create({
        companyId,
        name: dto.name.trim(),
        sku: dto.sku ?? null,
        unit: dto.unit ?? 'pcs',
        salePrice: dto.salePrice ?? 0,
        purchasePrice: dto.purchasePrice ?? 0,
        taxRate: dto.taxRate ?? 0,
        stock: 0,
        lowStockLevel: dto.lowStockLevel ?? 0,
        description: dto.description ?? null,
      }),
    );
    if (dto.stock && dto.stock > 0) {
      await this.moveStock(this.itemRepo.manager, item.id, dto.stock, StockReason.OPENING, 'Opening stock', user.id);
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

  async findById(id: string, user: AuthUser): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    assertAccess(item.companyId, user, 'Item');
    return item;
  }

  async update(id: string, dto: UpdateItemDto, user: AuthUser): Promise<Item> {
    writeCompanyId(user);
    const item = await this.findById(id, user);
    // Stock changes go through movements so the history stays accurate.
    const { stock: _ignored, name, ...rest } = dto;
    if (name !== undefined) item.name = name.trim();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) (item as any)[key] = value;
    }
    const saved = await this.itemRepo.save(item);
    await this.audit.log({ actorId: user.id, action: 'ITEM_UPDATED', resourceType: 'item', resourceId: id });
    return saved;
  }

  async adjustStock(id: string, dto: AdjustStockDto, user: AuthUser): Promise<Item> {
    writeCompanyId(user);
    const item = await this.findById(id, user);
    if (dto.change === 0) throw new BadRequestException('Change must not be zero');
    if (item.stock + dto.change < 0) {
      throw new BadRequestException(`Only ${item.stock} ${item.unit} in stock`);
    }
    await this.moveStock(
      this.itemRepo.manager, id, dto.change, StockReason.ADJUSTMENT, dto.note ?? 'Manual adjustment', user.id,
    );
    await this.audit.log({
      actorId: user.id, action: 'STOCK_ADJUSTED', resourceType: 'item', resourceId: id,
      details: { change: dto.change, note: dto.note },
    });
    return this.findById(id, user);
  }

  async movements(user: AuthUser, itemId?: string, limit = 50) {
    const qb = this.moveRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.item', 'item')
      .orderBy('m.createdAt', 'DESC')
      .take(Math.min(limit, 200));
    const scope = readScope(user);
    if (scope) qb.andWhere('m.companyId = :scope', { scope });
    if (itemId) qb.andWhere('m.itemId = :itemId', { itemId });
    return qb.getMany();
  }

  /** Stock value and low-stock overview for the inventory page and reports. */
  async stockSummary(user: AuthUser) {
    const scope = readScope(user);
    const items = await this.itemRepo.find({ where: scope ? { companyId: scope } : {}, order: { name: 'ASC' } });
    const active = items.filter((i) => i.isActive);
    return {
      items,
      totals: {
        itemCount: active.length,
        stockValue: round2(active.reduce((s, i) => s + i.stock * i.purchasePrice, 0)),
        retailValue: round2(active.reduce((s, i) => s + i.stock * i.salePrice, 0)),
        lowStockCount: active.filter((i) => i.stock <= i.lowStockLevel).length,
      },
    };
  }

  /**
   * Apply a stock change and record the movement. Callers pass their own manager
   * so invoice creation can do this inside the same transaction.
   */
  async moveStock(
    manager: EntityManager,
    itemId: string,
    change: number,
    reason: StockReason,
    reference: string | null,
    actorId: string | null,
  ): Promise<void> {
    const item = await manager.findOneByOrFail(Item, { id: itemId });
    item.stock = round2(item.stock + change);
    await manager.save(item);
    await manager.save(
      manager.create(StockMovement, {
        companyId: item.companyId,
        itemId,
        change,
        balanceAfter: item.stock,
        reason,
        reference,
        createdBy: actorId,
      }),
    );
  }
}
