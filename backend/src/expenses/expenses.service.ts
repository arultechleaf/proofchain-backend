import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Expense } from './expense.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const EXPENSE_METHODS = ['cash', 'bank', 'upi', 'card', 'cheque'];

export class CreateExpenseDto {
  @IsString() @MaxLength(60)
  category: string;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'expenseDate must be YYYY-MM-DD' })
  expenseDate?: string;

  @IsOptional() @IsIn(EXPENSE_METHODS)
  paymentMethod?: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;

  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsNumber() @Min(0.01) @Type(() => Number) amount?: number;
  @IsOptional() @Matches(ISO_DATE) expenseDate?: string;
  @IsOptional() @IsIn(EXPENSE_METHODS) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class ExpenseQueryDto {
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly repo: Repository<Expense>,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateExpenseDto, user: AuthUser): Promise<Expense> {
    const expense = await this.repo.save(
      this.repo.create({
        companyId: writeCompanyId(user),
        category: dto.category.trim(),
        amount: round2(dto.amount),
        expenseDate: dto.expenseDate ?? new Date().toISOString().slice(0, 10),
        paymentMethod: dto.paymentMethod ?? 'cash',
        description: dto.description?.trim() || null,
        reference: dto.reference?.trim() || null,
        createdBy: user.id,
      }),
    );
    await this.audit.log({
      actorId: user.id, action: 'EXPENSE_CREATED', resourceType: 'expense', resourceId: expense.id,
      details: { category: expense.category, amount: expense.amount },
    });
    return expense;
  }

  private filtered(query: ExpenseQueryDto, user: AuthUser) {
    const qb = this.repo.createQueryBuilder('e');
    const scope = readScope(user);
    if (scope) qb.andWhere('e.companyId = :scope', { scope });
    if (query.category) qb.andWhere('e.category = :category', { category: query.category });
    if (query.from) qb.andWhere('e.expenseDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('e.expenseDate <= :to', { to: query.to });
    if (query.search) {
      qb.andWhere('(e.description LIKE :s OR e.reference LIKE :s OR e.category LIKE :s)', { s: `%${query.search}%` });
    }
    return qb;
  }

  async findAll(query: ExpenseQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.filtered(query, user)
      .orderBy('e.expenseDate', 'DESC').addOrderBy('e.createdAt', 'DESC')
      .skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  /** Total spent in the range, split by category. */
  async summary(query: ExpenseQueryDto, user: AuthUser) {
    const rows = await this.filtered(query, user)
      .select('e.category', 'category')
      .addSelect('SUM(e.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.category')
      .getRawMany<{ category: string; total: string | number; count: string | number }>();
    const byCategory = rows
      .map((r) => ({ category: r.category, total: round2(Number(r.total)), count: Number(r.count) }))
      .sort((a, b) => b.total - a.total);
    return { total: round2(byCategory.reduce((s, r) => s + r.total, 0)), byCategory };
  }

  async categories(user: AuthUser): Promise<string[]> {
    const scope = readScope(user);
    const qb = this.repo.createQueryBuilder('e').select('DISTINCT e.category', 'category').orderBy('e.category', 'ASC');
    if (scope) qb.where('e.companyId = :scope', { scope });
    return (await qb.getRawMany<{ category: string }>()).map((r) => r.category);
  }

  private async find(id: number, user: AuthUser): Promise<Expense> {
    const expense = await this.repo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException('Expense not found');
    assertAccess(expense.companyId, user, 'Expense');
    return expense;
  }

  async update(id: number, dto: UpdateExpenseDto, user: AuthUser): Promise<Expense> {
    writeCompanyId(user);
    const expense = await this.find(id, user);
    if (dto.category !== undefined) expense.category = dto.category.trim();
    if (dto.amount !== undefined) expense.amount = round2(dto.amount);
    if (dto.expenseDate !== undefined) expense.expenseDate = dto.expenseDate;
    if (dto.paymentMethod !== undefined) expense.paymentMethod = dto.paymentMethod;
    if (dto.description !== undefined) expense.description = dto.description.trim() || null;
    if (dto.reference !== undefined) expense.reference = dto.reference.trim() || null;
    if (!expense.category) throw new BadRequestException('Category is required');
    return this.repo.save(expense);
  }

  async remove(id: number, user: AuthUser): Promise<void> {
    writeCompanyId(user);
    const expense = await this.find(id, user);
    await this.repo.remove(expense);
    await this.audit.log({
      actorId: user.id, action: 'EXPENSE_DELETED', resourceType: 'expense', resourceId: id,
      details: { category: expense.category, amount: expense.amount },
    });
  }
}
