import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, OneToMany, JoinColumn, Index,
} from 'typeorm';
import { Party } from '../parties/party.entity';
import { InvoiceLine } from './invoice-line.entity';

export enum InvoiceType {
  SALE = 'sale',
  PURCHASE = 'purchase',
}

export enum InvoiceStatus {
  ISSUED = 'issued',
  PARTIAL = 'partial',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

@Entity('invoices')
@Index(['companyId', 'type'])
@Index(['companyId', 'type', 'invoiceNumber'], { unique: true })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', length: 36 })
  companyId: string;

  @Column({ type: 'varchar', length: 20 })
  type: InvoiceType;

  @Column({ name: 'invoice_number', length: 50 })
  invoiceNumber: string;

  @Column({ name: 'party_id', length: 36 })
  partyId: string;

  @ManyToOne(() => Party, { eager: false })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  /** ISO date (YYYY-MM-DD). */
  @Column({ name: 'invoice_date', length: 10 })
  invoiceDate: string;

  @Column({ name: 'due_date', type: 'varchar', length: 10, nullable: true })
  dueDate: string | null;

  @OneToMany(() => InvoiceLine, (l) => l.invoice, { cascade: true })
  lines: InvoiceLine[];

  @Column({ type: 'double', default: 0 })
  subtotal: number;

  @Column({ name: 'tax_total', type: 'double', default: 0 })
  taxTotal: number;

  @Column({ type: 'double', default: 0 })
  discount: number;

  @Column({ type: 'double', default: 0 })
  total: number;

  @Column({ name: 'paid_amount', type: 'double', default: 0 })
  paidAmount: number;

  @Column({ type: 'varchar', length: 20, default: InvoiceStatus.ISSUED })
  status: InvoiceStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes: string | null;

  @Column({ name: 'payload_hash', type: 'varchar', length: 128, nullable: true })
  payloadHash: string | null;

  @Column({ name: 'canonical_payload', type: 'text', nullable: true })
  canonicalPayload: string | null;

  @Column({ name: 'blockchain_status', type: 'varchar', length: 30, default: 'not_submitted' })
  blockchainStatus: string;

  @Column({ name: 'blockchain_transaction_id', type: 'varchar', length: 36, nullable: true })
  blockchainTransactionId: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
