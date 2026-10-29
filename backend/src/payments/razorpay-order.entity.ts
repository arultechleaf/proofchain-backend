import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type RazorpayOrderStatus = 'created' | 'paid';

/**
 * One row per Razorpay order we create. It pins the amount and invoice server-side, so a
 * payment can only ever be applied to what we asked Razorpay to collect, never to values
 * sent back by the browser.
 */
@Entity('razorpay_orders')
@Index(['orderId'], { unique: true })
@Index(['invoiceId'])
export class RazorpayOrder {
  @PrimaryGeneratedColumn()
  id: number;

  /** Razorpay's order id, e.g. order_Abc123. */
  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'invoice_id', type: 'int' })
  invoiceId: number;

  @Column({ name: 'party_id', type: 'int' })
  partyId: number;

  /** Amount in rupees (Razorpay itself works in paise). */
  @Column({ type: 'double' })
  amount: number;

  @Column({ length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'created' })
  status: RazorpayOrderStatus;

  @Column({ name: 'razorpay_payment_id', type: 'varchar', length: 64, nullable: true })
  razorpayPaymentId: string | null;

  /** The Payment row recorded once the order was paid. */
  @Column({ name: 'payment_record_id', type: 'int', nullable: true })
  paymentRecordId: number | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'paid_at', type: 'varchar', length: 40, nullable: true })
  paidAt: string | null;
}
