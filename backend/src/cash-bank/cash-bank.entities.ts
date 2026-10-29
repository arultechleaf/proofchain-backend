import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AccountType {
  CASH = 'cash',
  BANK = 'bank',
}

export enum BankTxType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
}

/** Types that add money to an account; every other type takes money out. */
export const CREDIT_TYPES = [BankTxType.DEPOSIT, BankTxType.TRANSFER_IN];

/** A cash drawer or a bank account owned by one company. */
@Entity('bank_accounts')
@Index(['companyId'])
export class BankAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'account_type', type: 'varchar', length: 10, default: AccountType.BANK })
  accountType: AccountType;

  @Column({ name: 'account_number', type: 'varchar', length: 40, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'opening_balance', type: 'double', default: 0 })
  openingBalance: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** One movement of money in or out of an account. A transfer is two rows, one per account. */
@Entity('bank_transactions')
@Index(['companyId', 'transactionDate'])
@Index(['accountId'])
export class BankTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'account_id', type: 'int' })
  accountId: number;

  @Column({ type: 'varchar', length: 20 })
  type: BankTxType;

  @Column({ type: 'double' })
  amount: number;

  @Column({ name: 'transaction_date', length: 10 })
  transactionDate: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  /** For transfers: the account on the other side. */
  @Column({ name: 'counter_account_id', type: 'int', nullable: true })
  counterAccountId: number | null;

  /** Groups the two rows of one transfer. */
  @Column({ name: 'transfer_id', type: 'varchar', length: 36, nullable: true })
  transferId: string | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
