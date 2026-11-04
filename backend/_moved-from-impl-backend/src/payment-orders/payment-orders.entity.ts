import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum PaymentOrderStatus {
  CREATED = 'CREATED',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('payment_orders')
export class PaymentOrder {
  @PrimaryGeneratedColumn()
  payment_order_id: number;

  @Column()
  payer_type: string;

  @Column()
  payer_id: string;

  @Column()
  fee_plan_id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  base_amount: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  gst_amount: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total_amount: string;

  @Column({ type: 'bigint' })
  amount_paise: string;

  @Column({ unique: true })
  receipt_no: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpay_order_id: string | null;

  @Column({ default: 'CREATED' })
  status: string;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'int', nullable: true })
  created_by: number | null;
}