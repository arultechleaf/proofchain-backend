import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum WalletTransactionType {
  CLAIM_DEBIT = 'claim_debit',
  CLAIM_REFUND = 'claim_refund',
  ADMIN_CREDIT = 'admin_credit',
  PAYMENT_CREDIT = 'payment_credit',
  PAYMENT_CREDIT_REVERSAL = 'payment_credit_reversal',
}

@Entity('wallets')
@Index(['userId'], { unique: true })
export class Wallet {
  @PrimaryGeneratedColumn({ name: 'wallet_id' }) id: number;
  @Column({ name: 'user_id', type: 'int' }) userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('wallet_transactions')
@Index(['walletId', 'createdAt'])
export class WalletTransaction {
  @PrimaryGeneratedColumn({ name: 'wallet_transaction_id' }) id: number;
  @Column({ name: 'wallet_id', type: 'int' }) walletId: number;
  @ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;
  @Column({ type: 'varchar', length: 30 }) type: WalletTransactionType;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: string;
  @Column({ name: 'reference_id', type: 'varchar', length: 64, unique: true })
  referenceId: string;
  @Column({ name: 'created_by', type: 'int', nullable: true }) createdBy:
    number | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) description:
    string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
