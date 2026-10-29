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
import { User } from '../users/user.entity';

export enum ApprovalDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('approvals')
@Index(['deliveryId'])
export class Approval {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'delivery_id', type: 'int' })
  deliveryId: number;

  @ManyToOne(() => Delivery, { eager: false })
  @JoinColumn({ name: 'delivery_id' })
  delivery: Delivery;

  @Column({ name: 'reviewer_id', type: 'int' })
  reviewerId: number;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({ type: 'varchar', length: 30 })
  decision: ApprovalDecision;

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
