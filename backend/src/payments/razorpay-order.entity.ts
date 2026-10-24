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
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Razorpay's order id, e.g. order_Abc123. */
  @Column({ name: 'order_id', length: 64 })
  orderId: string;

  @Column({ name: 'company_id', length: 36 })
  companyId: string;

  @Column({ name: 'invoice_id', length: 36 })
  invoiceId: string;

  @Column({ name: 'party_id', length: 36 })
  partyId: string;

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
  @Column({ name: 'payment_record_id', type: 'varchar', length: 36, nullable: true })
  paymentRecordId: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'paid_at', type: 'varchar', length: 40, nullable: true })
  paidAt: string | null;
}
