import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';
import { BlockchainTransaction } from '../blockchain/blockchain-transaction.entity';

export enum VerificationStatus {
  VERIFIED = 'verified',
  MISMATCH = 'mismatch',
  NOT_FOUND = 'not_found',
  PENDING = 'pending',
  ERROR = 'error',
}

@Entity('proof_records')
@Index(['deliveryId'])
export class ProofRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'delivery_id' })
  deliveryId: string;

  @ManyToOne(() => Delivery, { eager: false })
  @JoinColumn({ name: 'delivery_id' })
  delivery: Delivery;

  @Column({ length: 20, default: 'SHA-256' })
  algorithm: string;

  @Column({ name: 'payload_hash', length: 128 })
  payloadHash: string;

  @Column({ name: 'blockchain_transaction_id', type: 'varchar', length: 36, nullable: true })
  blockchainTransactionId: string | null;

  @ManyToOne(() => BlockchainTransaction, { eager: false, nullable: true })
  @JoinColumn({ name: 'blockchain_transaction_id' })
  blockchainTransaction: BlockchainTransaction | null;

  @Column({ name: 'verified_at', type: 'text', nullable: true })
  verifiedAt: Date | null;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 30,
    default: VerificationStatus.PENDING,
  })
  verificationStatus: VerificationStatus;

  @Column({ name: 'canonical_payload', type: 'text', nullable: true })
  canonicalPayload: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
