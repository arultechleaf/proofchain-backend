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
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 20 })
  type: InvoiceType;

  @Column({ name: 'invoice_number', length: 50 })
  invoiceNumber: string;

  @Column({ name: 'party_id', type: 'int' })
  partyId: number;

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

  @Column({ name: 'blockchain_transaction_id', type: 'int', nullable: true })
  blockchainTransactionId: number | null;

  /** How the customer pays: cash, upi, bank or credit (pay later). */
  @Column({ name: 'payment_type', type: 'varchar', length: 10, nullable: true })
  paymentType: string | null;

  /** Customer details as they were on this invoice (the customer record may change later). */
  @Column({ name: 'customer_mobile', type: 'varchar', length: 30, nullable: true })
  customerMobile: string | null;

  @Column({ name: 'customer_gstin', type: 'varchar', length: 15, nullable: true })
  customerGstin: string | null;

  @Column({ name: 'billing_address', type: 'varchar', length: 500, nullable: true })
  billingAddress: string | null;

  /** State code (first two digits of a GSTIN) that decides CGST+SGST versus IGST. */
  @Column({ name: 'place_of_supply', type: 'varchar', length: 2, nullable: true })
  placeOfSupply: string | null;

  /** Subtotal minus line discounts; null on invoices made before GST support. */
  @Column({ name: 'taxable_value', type: 'double', nullable: true })
  taxableValue: number | null;

  @Column({ type: 'double', default: 0 })
  cgst: number;

  @Column({ type: 'double', default: 0 })
  sgst: number;

  @Column({ type: 'double', default: 0 })
  igst: number;

  @Column({ name: 'round_off', type: 'double', default: 0 })
  roundOff: number;

  /** The branch / godown the stock of this document moved at. */
  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
