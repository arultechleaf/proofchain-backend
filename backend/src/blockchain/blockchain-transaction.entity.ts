import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';

export enum BlockchainTxStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

export enum BlockchainTxType {
  PROOF_REGISTRATION = 'proof_registration',
  STATUS_UPDATE = 'status_update',
  VERIFICATION = 'verification',
}

@Entity('blockchain_transactions')
@Index(['deliveryId'])
@Index(['invoiceId'])
export class BlockchainTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'delivery_id', type: 'varchar', length: 36, nullable: true })
  deliveryId: string | null;

  /** Set when the transaction registers an invoice/bill proof instead of a delivery proof. */
  @Column({ name: 'invoice_id', type: 'varchar', length: 36, nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => Delivery, { eager: false, nullable: true })
  @JoinColumn({ name: 'delivery_id' })
  delivery: Delivery;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 70, nullable: true })
  transactionHash: string | null;

  @Column({ name: 'block_number', nullable: true, type: 'integer' })
  blockNumber: number | null;

  @Column({ name: 'contract_address', type: 'varchar', length: 64, nullable: true })
  contractAddress: string | null;

  @Column({
    name: 'transaction_type',
    type: 'varchar',
    length: 50,
    default: BlockchainTxType.PROOF_REGISTRATION,
  })
  transactionType: BlockchainTxType;

  @Column({
    type: 'varchar',
    length: 30,
    default: BlockchainTxStatus.PENDING,
  })
  status: BlockchainTxStatus;

  @Column({ name: 'retry_count', default: 0 })
  retryCount: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'gas_used', nullable: true, type: 'integer' })
  gasUsed: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
