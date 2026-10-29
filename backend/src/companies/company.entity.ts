import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';

export enum CompanyType {
  SENDER = 'sender',
  RECEIVER = 'receiver',
  AUDITOR = 'auditor',
}

@Entity('companies')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'organization_code', unique: true, length: 50 })
  organizationCode: string;

  @Column({
    name: 'organization_type',
    type: 'varchar',
    length: 30,
    default: CompanyType.SENDER,
  })
  organizationType: CompanyType;

  @Column({ nullable: true, length: 500 })
  description: string;

  /** The organization's own GSTIN; its first two digits are the state used for CGST/SGST vs IGST. */
  @Column({ type: 'varchar', length: 15, nullable: true })
  gstin: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
