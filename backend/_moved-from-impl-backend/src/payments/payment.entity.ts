import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  payment_id: string;

  @Column({ type: 'bigint', unique: true })
  payment_order_id: string;

  @Column({ length: 100, unique: true })
  razorpay_payment_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  razorpay_signature: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_method: string | null;

  @Column({ type: 'tinyint', default: 1 })
  status: number; // 1 = captured

  @Column({ type: 'datetime' })
  paid_at: Date;

  @CreateDateColumn()
  created_at: Date;
}