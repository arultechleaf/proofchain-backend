import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Party } from '../parties/party.entity';
import { Invoice } from '../invoices/invoice.entity';

export enum PaymentDirection {
  /** Money received from a customer. */
  IN = 'in',
  /** Money paid to a supplier. */
  OUT = 'out',
}

@Entity('payments')
@Index(['companyId'])
@Index(['partyId'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', length: 36 })
  companyId: string;

  @Column({ name: 'party_id', length: 36 })
  partyId: string;

  @ManyToOne(() => Party, { eager: false })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ name: 'invoice_id', type: 'varchar', length: 36, nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => Invoice, { eager: false, nullable: true })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice | null;

  @Column({ type: 'varchar', length: 10 })
  direction: PaymentDirection;

  @Column({ type: 'double' })
  amount: number;

  @Column({ length: 20, default: 'cash' })
  method: string;

  /** ISO date (YYYY-MM-DD). */
  @Column({ name: 'payment_date', length: 10 })
  paymentDate: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 36, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
