import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import {
  AccountType, BankAccount, BankTransaction, BankTxType, CREDIT_TYPES,
} from './cash-bank.entities';
import { AuditService } from '../audit/audit.service';
import { AuthUser, assertAccess, readScope, round2, writeCompanyId } from '../common/tenant';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAccountDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsEnum(AccountType)
  accountType?: AccountType;

  @IsOptional() @IsString() @MaxLength(40)
  accountNumber?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  openingBalance?: number;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(40)
  accountNumber?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CreateBankTransactionDto {
  @Type(() => Number) @IsInt()
  accountId: number;

  @IsIn([BankTxType.DEPOSIT, BankTxType.WITHDRAWAL])
  type: BankTxType.DEPOSIT | BankTxType.WITHDRAWAL;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'transactionDate must be YYYY-MM-DD' })
  transactionDate?: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;

  @IsOptional() @IsString() @MaxLength(100)
  reference?: string;
}

export class TransferDto {
  @Type(() => Number) @IsInt()
  fromAccountId: number;

  @Type(() => Number) @IsInt()
  toAccountId: number;

  @IsNumber() @Min(0.01) @Type(() => Number)
  amount: number;

  @IsOptional() @Matches(ISO_DATE, { message: 'transactionDate must be YYYY-MM-DD' })
  transactionDate?: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;
}

export class BankTransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt()
  accountId?: number;

  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  limit?: number;
}

@Injectable()
export class CashBankService {
  constructor(
    @InjectRepository(BankAccount) private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(BankTransaction) private readonly txRepo: Repository<BankTransaction>,
    private readonly audit: AuditService,
  ) {}

  // ── accounts ─────────────────────────────────────────────────────────────

  async createAccount(dto: CreateAccountDto, user: AuthUser): Promise<BankAccount> {
    const companyId = writeCompanyId(user);
    const name = dto.name.trim();
    if (await this.accountRepo.findOne({ where: { companyId, name } })) {
      throw new BadRequestException(`An account called "${name}" already exists`);
    }
    const account = await this.accountRepo.save(
      this.accountRepo.create({
        companyId,
        name,
        accountType: dto.accountType ?? AccountType.BANK,
        accountNumber: dto.accountNumber?.trim() || null,
        openingBalance: round2(dto.openingBalance ?? 0),
      }),
    );
    await this.audit.log({
      actorId: user.id, action: 'ACCOUNT_CREATED', resourceType: 'bank_account', resourceId: account.id,
      details: { name: account.name, accountType: account.accountType },
    });
    return account;
  }

  async updateAccount(id: number, dto: UpdateAccountDto, user: AuthUser): Promise<BankAccount> {
    writeCompanyId(user);
    const account = await this.findAccount(id, user);
    if (dto.name !== undefined) account.name = dto.name.trim();
    if (dto.accountNumber !== undefined) account.accountNumber = dto.accountNumber.trim() || null;
    if (dto.isActive !== undefined) account.isActive = dto.isActive;
    return this.accountRepo.save(account);
  }

  async findAccount(id: number, user: AuthUser): Promise<BankAccount> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    assertAccess(account.companyId, user, 'Account');
    return account;
  }

  /** Net movement per account (credits minus debits), keyed by account id. */
  private async netByAccount(companyId?: number): Promise<Map<number, number>> {
    const qb = this.txRepo
      .createQueryBuilder('t')
      .select('t.accountId', 'accountId')
      .addSelect(`SUM(CASE WHEN t.type IN ('${CREDIT_TYPES.join("','")}') THEN t.amount ELSE -t.amount END)`, 'net')
      .groupBy('t.accountId');
    if (companyId) qb.where('t.companyId = :companyId', { companyId });
    const rows = await qb.getRawMany<{ accountId: number; net: string | number | null }>();
    return new Map(rows.map((r) => [r.accountId, Number(r.net ?? 0)]));
  }

  /** Every account with its current balance, plus totals for cash and bank. */
  async listAccounts(user: AuthUser) {
    const scope = readScope(user);
    const [accounts, nets] = await Promise.all([
      this.accountRepo.find({ where: scope ? { companyId: scope } : {}, order: { name: 'ASC' } }),
      this.netByAccount(scope),
    ]);
    const rows = accounts.map((a) => ({ ...a, balance: round2(a.openingBalance + (nets.get(a.id) ?? 0)) }));
    const sum = (type?: AccountType) =>
      round2(rows.filter((r) => r.isActive && (!type || r.accountType === type)).reduce((s, r) => s + r.balance, 0));
    return { rows, totals: { all: sum(), cash: sum(AccountType.CASH), bank: sum(AccountType.BANK) } };
  }

  private async balanceOf(account: BankAccount): Promise<number> {
    const nets = await this.netByAccount(account.companyId);
    return round2(account.openingBalance + (nets.get(account.id) ?? 0));
  }

  // ── transactions ─────────────────────────────────────────────────────────

  /** Delete an account that has no transactions. */
  async removeAccount(id: number, user: AuthUser): Promise<void> {
    writeCompanyId(user);
    const account = await this.findAccount(id, user);
    const used = await this.txRepo.count({ where: { accountId: id } });
    if (used) throw new BadRequestException(`"${account.name}" has ${used} transaction(s), so it cannot be deleted. Deactivate it instead.`);
    await this.accountRepo.remove(account);
    await this.audit.log({ actorId: user.id, action: 'ACCOUNT_DELETED', resourceType: 'bank_account', resourceId: id, details: { name: account.name } });
  }

  /**
   * Delete a deposit or withdrawal. A transfer is two rows, so deleting either side removes both.
   * Refused when removing it would leave an account with a negative balance.
   */
  async removeTransaction(id: number, user: AuthUser): Promise<void> {
    writeCompanyId(user);
    const tx = await this.txRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException('Transaction not found');
    assertAccess(tx.companyId, user, 'Transaction');
    const rows = tx.transferId ? await this.txRepo.find({ where: { transferId: tx.transferId } }) : [tx];

    const nets = await this.netByAccount(tx.companyId);
    for (const row of rows) {
      const account = await this.accountRepo.findOne({ where: { id: row.accountId } });
      if (!account) continue;
      const credit = CREDIT_TYPES.includes(row.type);
      const after = round2(account.openingBalance + (nets.get(account.id) ?? 0) + (credit ? -row.amount : row.amount));
      if (after < 0) {
        throw new BadRequestException(`Deleting this would leave "${account.name}" with a negative balance (${after})`);
      }
    }
    await this.txRepo.remove(rows);
    await this.audit.log({
      actorId: user.id, action: 'BANK_TRANSACTION_DELETED', resourceType: 'bank_transaction', resourceId: id,
      details: { type: tx.type, amount: tx.amount, rows: rows.length },
    });
  }

  async createTransaction(dto: CreateBankTransactionDto, user: AuthUser): Promise<BankTransaction> {
    writeCompanyId(user);
    const account = await this.findAccount(dto.accountId, user);
    this.assertUsable(account);
    const amount = round2(dto.amount);
    if (dto.type === BankTxType.WITHDRAWAL) await this.assertFunds(account, amount);

    const tx = await this.txRepo.save(
      this.txRepo.create({
        companyId: account.companyId, accountId: account.id, type: dto.type, amount,
        transactionDate: dto.transactionDate ?? new Date().toISOString().slice(0, 10),
        description: dto.description?.trim() || null, reference: dto.reference?.trim() || null,
        createdBy: user.id,
      }),
    );
    await this.audit.log({
      actorId: user.id, action: dto.type === BankTxType.DEPOSIT ? 'BANK_DEPOSIT' : 'BANK_WITHDRAWAL',
      resourceType: 'bank_transaction', resourceId: tx.id, details: { account: account.name, amount },
    });
    return tx;
  }

  /** Move money between two accounts of the same company, atomically. */
  async transfer(dto: TransferDto, user: AuthUser) {
    writeCompanyId(user);
    if (dto.fromAccountId === dto.toAccountId) throw new BadRequestException('Choose two different accounts');
    const [from, to] = await Promise.all([
      this.findAccount(dto.fromAccountId, user),
      this.findAccount(dto.toAccountId, user),
    ]);
    this.assertUsable(from);
    this.assertUsable(to);
    if (from.companyId !== to.companyId) throw new BadRequestException('Accounts belong to different organizations');
    const amount = round2(dto.amount);
    await this.assertFunds(from, amount);

    const transferId = randomUUID();
    const date = dto.transactionDate ?? new Date().toISOString().slice(0, 10);
    const description = dto.description?.trim() || `Transfer ${from.name} → ${to.name}`;
    const base = { companyId: from.companyId, amount, transactionDate: date, description, transferId, createdBy: user.id };

    const rows = await this.txRepo.manager.transaction((m) =>
      m.save(BankTransaction, [
        m.create(BankTransaction, { ...base, accountId: from.id, type: BankTxType.TRANSFER_OUT, counterAccountId: to.id }),
        m.create(BankTransaction, { ...base, accountId: to.id, type: BankTxType.TRANSFER_IN, counterAccountId: from.id }),
      ]),
    );
    await this.audit.log({
      actorId: user.id, action: 'BANK_TRANSFER', resourceType: 'bank_transaction', resourceId: transferId,
      details: { from: from.name, to: to.name, amount },
    });
    return { transferId, rows };
  }

  async listTransactions(query: BankTransactionQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const scope = readScope(user);
    const qb = this.txRepo.createQueryBuilder('t').orderBy('t.transactionDate', 'DESC').addOrderBy('t.createdAt', 'DESC');
    if (scope) qb.andWhere('t.companyId = :scope', { scope });
    if (query.accountId) qb.andWhere('t.accountId = :accountId', { accountId: query.accountId });
    if (query.type) qb.andWhere('t.type = :type', { type: query.type });
    if (query.from) qb.andWhere('t.transactionDate >= :from', { from: query.from });
    if (query.to) qb.andWhere('t.transactionDate <= :to', { to: query.to });
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const accounts = await this.accountRepo.find({ where: scope ? { companyId: scope } : {} });
    const names = new Map(accounts.map((a) => [a.id, a.name]));
    return {
      data: data.map((t) => ({
        ...t,
        accountName: names.get(t.accountId) ?? '—',
        counterAccountName: t.counterAccountId ? names.get(t.counterAccountId) ?? '—' : null,
      })),
      total, page, limit,
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private assertUsable(account: BankAccount) {
    if (!account.isActive) throw new BadRequestException(`Account "${account.name}" is inactive`);
  }

  private async assertFunds(account: BankAccount, amount: number) {
    const balance = await this.balanceOf(account);
    if (amount > balance) {
      throw new BadRequestException(`Insufficient balance in "${account.name}" (available ${balance})`);
    }
  }
}
