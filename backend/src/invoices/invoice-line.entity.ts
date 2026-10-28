import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_lines')
@Index(['invoiceId'])
export class InvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_id', length: 36 })
  invoiceId: string;

  @ManyToOne(() => Invoice, (i) => i.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  /** Line order within the invoice; keeps the proof hash reproducible. */
  @Column({ type: 'integer', default: 0 })
  position: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  sku: string | null;

  @Column({ name: 'hsn_code', type: 'varchar', length: 20, nullable: true })
  hsnCode: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unit: string | null;

  /** 'amount' or 'percent'. */
  @Column({ name: 'discount_type', type: 'varchar', length: 10, nullable: true })
  discountType: string | null;

  /** What the user typed: a flat amount or a percentage. */
  @Column({ name: 'discount_value', type: 'double', default: 0 })
  discountValue: number;

  /** The discount in money. */
  @Column({ name: 'discount_amount', type: 'double', default: 0 })
  discountAmount: number;

  @Column({ name: 'taxable_amount', type: 'double', nullable: true })
  taxableAmount: number | null;

  @Column({ name: 'gst_amount', type: 'double', default: 0 })
  gstAmount: number;

  @Column({ name: 'line_total', type: 'double', nullable: true })
  lineTotal: number | null;

  @Column({ name: 'item_id', type: 'varchar', length: 36, nullable: true })
  itemId: string | null;

  @Column({ length: 255 })
  description: string;

  @Column({ type: 'double' })
  quantity: number;

  @Column({ type: 'double' })
  rate: number;

  @Column({ name: 'tax_rate', type: 'double', default: 0 })
  taxRate: number;

  /** quantity × rate, before tax. */
  @Column({ type: 'double' })
  amount: number;
}
