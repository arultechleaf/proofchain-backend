import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum PartyType {
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  BOTH = 'both',
}

@Entity('parties')
@Index(['companyId'])
export class Party {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_id', length: 36 })
  companyId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ name: 'party_type', type: 'varchar', length: 20, default: PartyType.CUSTOMER })
  partyType: PartyType;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 50, nullable: true })
  taxId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  /** Positive = party owes the company, negative = company owes the party. */
  @Column({ name: 'opening_balance', type: 'double', default: 0 })
  openingBalance: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
