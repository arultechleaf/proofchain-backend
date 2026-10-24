import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Company } from '../companies/company.entity';

export enum UserRole {
  ADMIN = 'admin',
  COMPANY_A = 'company_a',
  COMPANY_B = 'company_b',
  AUDITOR = 'auditor',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 30, default: UserRole.COMPANY_A })
  role: UserRole;

  @Column({ name: 'company_id', nullable: true })
  companyId: string;

  @ManyToOne(() => Company, { nullable: true, eager: false })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'reset_token_hash', type: 'varchar', length: 64, nullable: true })
  resetTokenHash: string | null;

  @Column({ name: 'reset_token_expires', type: 'varchar', length: 40, nullable: true })
  resetTokenExpires: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
