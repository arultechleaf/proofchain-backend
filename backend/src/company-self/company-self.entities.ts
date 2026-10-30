import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Bank and invoice settings of one company. One row per company, created the first time it is opened. */
@Entity('company_settings')
@Index(['companyId'], { unique: true })
export class CompanySettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  // ── bank details printed on invoices ──
  @Column({ name: 'bank_name', type: 'varchar', length: 100, nullable: true })
  bankName: string | null;

  @Column({ name: 'account_holder', type: 'varchar', length: 100, nullable: true })
  accountHolder: string | null;

  @Column({ name: 'account_number', type: 'varchar', length: 30, nullable: true })
  accountNumber: string | null;

  @Column({ name: 'ifsc_code', type: 'varchar', length: 11, nullable: true })
  ifscCode: string | null;

  @Column({ name: 'bank_branch', type: 'varchar', length: 100, nullable: true })
  bankBranch: string | null;

  @Column({ name: 'upi_id', type: 'varchar', length: 60, nullable: true })
  upiId: string | null;

  // ── invoice defaults ──
  /** Sales documents are numbered PREFIX-YEAR-0001. */
  @Column({ name: 'sales_prefix', type: 'varchar', length: 10, default: 'INV' })
  salesPrefix: string;

  @Column({ name: 'purchase_prefix', type: 'varchar', length: 10, default: 'BILL' })
  purchasePrefix: string;

  /** GST rate (percent) a new blank invoice line starts with. */
  @Column({ name: 'default_tax_rate', type: 'double', default: 0 })
  defaultTaxRate: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ name: 'payment_terms_days', type: 'int', default: 0 })
  paymentTermsDays: number;

  @Column({ type: 'text', nullable: true })
  terms: string | null;

  @Column({ name: 'invoice_notes', type: 'text', nullable: true })
  invoiceNotes: string | null;

  @Column({ name: 'invoice_footer', type: 'varchar', length: 255, nullable: true })
  invoiceFooter: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** A location of a company: a shop, office or godown (warehouse). */
@Entity('branches')
@Index(['companyId'])
@Index(['companyId', 'code'], { unique: true })
export class Branch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  /** Short code, unique within the company, for example MAIN or GDN-2. */
  @Column({ type: 'varchar', length: 20 })
  code: string;

  /** 'branch' (shop / office) or 'godown' (warehouse). */
  @Column({ type: 'varchar', length: 20, default: 'branch' })
  kind: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pincode: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  /** Name of the person in charge. */
  @Column({ name: 'contact_person', type: 'varchar', length: 100, nullable: true })
  contactPerson: string | null;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
