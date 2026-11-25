import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ClaimStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('claims')
@Index(['userId', 'createdAt'])
@Index(['userId', 'requestId'], { unique: true })
export class Claim {
  @PrimaryGeneratedColumn({ name: 'claim_id' }) id: number;
  @Column({ name: 'user_id', type: 'int' }) userId: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) amount: string;
  @Column({
    type: 'varchar',
    length: 30,
    default: ClaimStatus.PENDING,
  })
  status: ClaimStatus;
  @Column({ name: 'wallet_id', type: 'int' }) walletId: number;
  @Column({ name: 'request_id', type: 'char', length: 36 }) requestId: string;
  @Column({
    name: 'razorpay_contact_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  razorpayContactId: string | null;
  @Column({
    name: 'razorpay_fund_account_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  razorpayFundAccountId: string | null;
  @Column({
    name: 'razorpay_payout_id',
    type: 'varchar',
    length: 64,
    nullable: true,
    unique: true,
  })
  razorpayPayoutId: string | null;
  @Column({
    name: 'payout_idempotency_key',
    type: 'char',
    length: 36,
    unique: true,
  })
  payoutIdempotencyKey: string;
  @Column({ name: 'bank_account_last_four', type: 'varchar', length: 4 })
  bankAccountLastFour: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) utr: string | null;
  @Column({
    name: 'failure_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  failureReason: string | null;
  @Column({ name: 'reference_id', type: 'varchar', length: 64, unique: true })
  referenceId: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('claim_bank_accounts')
@Index(['userId'], { unique: true })
export class ClaimBankAccount {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'user_id', type: 'int' }) userId: number;
  /** AES-256-GCM encrypted JSON; plaintext account data is never persisted. */
  @Column({ name: 'encrypted_details', type: 'text' }) encryptedDetails: string;
  @Column({ name: 'last_four', type: 'varchar', length: 4 }) lastFour: string;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
