import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Company } from '../companies/company.entity';
import { User } from '../users/user.entity';

export enum DeliveryStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
}

export enum BlockchainStatus {
  NOT_SUBMITTED = 'not_submitted',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('deliveries')
@Index(['status'])
@Index(['senderCompanyId'])
@Index(['receiverCompanyId'])
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'delivery_reference', unique: true, length: 100 })
  deliveryReference: string;

  @Column({ name: 'sender_company_id' })
  senderCompanyId: string;

  @ManyToOne(() => Company, { eager: false })
  @JoinColumn({ name: 'sender_company_id' })
  senderCompany: Company;

  @Column({ name: 'receiver_company_id' })
  receiverCompanyId: string;

  @ManyToOne(() => Company, { eager: false })
  @JoinColumn({ name: 'receiver_company_id' })
  receiverCompany: Company;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'simple-json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'payload_hash', type: 'varchar', length: 128, nullable: true })
  payloadHash: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: DeliveryStatus.PENDING,
  })
  status: DeliveryStatus;

  @Column({
    name: 'blockchain_status',
    type: 'varchar',
    length: 30,
    default: BlockchainStatus.NOT_SUBMITTED,
  })
  blockchainStatus: BlockchainStatus;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => User, { eager: false, nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
