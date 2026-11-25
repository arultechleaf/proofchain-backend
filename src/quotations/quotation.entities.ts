import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Party } from '../parties/party.entity';

export enum QuotationStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  /** Turned into a sales invoice; the quotation is now locked. */
  CONVERTED = 'converted',
}

@Entity('quotations')
@Index(['companyId'])
@Index(['companyId', 'quotationNumber'], { unique: true })
export class Quotation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'quotation_number', length: 50 })
  quotationNumber: string;

  @Column({ name: 'party_id', type: 'int' })
  partyId: number;

  @ManyToOne(() => Party, { eager: false })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ name: 'quotation_date', length: 10 })
  quotationDate: string;

  @Column({ name: 'valid_until', type: 'varchar', length: 10, nullable: true })
  validUntil: string | null;

  @OneToMany(() => QuotationLine, (l) => l.quotation, { cascade: true })
  lines: QuotationLine[];

  @Column({ type: 'double', default: 0 })
  subtotal: number;

  @Column({ name: 'tax_total', type: 'double', default: 0 })
  taxTotal: number;

  @Column({ type: 'double', default: 0 })
  discount: number;

  @Column({ type: 'double', default: 0 })
  total: number;

  @Column({ type: 'varchar', length: 20, default: QuotationStatus.DRAFT })
  status: QuotationStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  /** Set when the quotation is converted. */
  @Column({ name: 'converted_invoice_id', type: 'int', nullable: true })
  convertedInvoiceId: number | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('quotation_lines')
@Index(['quotationId'])
export class QuotationLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'quotation_id', type: 'int' })
  quotationId: number;

  @ManyToOne(() => Quotation, (q) => q.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quotation_id' })
  quotation: Quotation;

  @Column({ type: 'integer', default: 0 })
  position: number;

  @Column({ name: 'item_id', type: 'int', nullable: true })
  itemId: number | null;

  @Column({ length: 255 })
  description: string;

  @Column({ type: 'double' })
  quantity: number;

  @Column({ type: 'double' })
  rate: number;

  @Column({ name: 'tax_rate', type: 'double', default: 0 })
  taxRate: number;

  @Column({ type: 'double' })
  amount: number;
}
