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
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'party_id', type: 'int' })
  partyId: number;

  @ManyToOne(() => Party, { eager: false })
  @JoinColumn({ name: 'party_id' })
  party: Party;

  @Column({ name: 'invoice_id', type: 'int', nullable: true })
  invoiceId: number | null;

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

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
