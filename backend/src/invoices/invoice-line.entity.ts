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
