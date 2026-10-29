import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  AfterLoad,
  AfterInsert,
  AfterUpdate,
} from 'typeorm';
import { Role } from '../role-permissions/role-permissions';
import { Company } from '../companies/company.entity';

export enum UserRole {
  ADMIN = 'admin',
  COMPANY_A = 'company_a',
  COMPANY_B = 'company_b',
  MANAGER = 'manager',
  USER = 'user',
  AUDITOR = 'auditor',
}

@Entity('users')
@Index(['mobile'], { unique: true })
@Index(['userCode'], { unique: true })
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  /** The user's role, stored as a number: the id of a row in the roles table. */
  @Column({ name: 'role_id', type: 'int' })
  roleId: number;

  @ManyToOne(() => Role, { eager: true, nullable: false })
  @JoinColumn({ name: 'role_id' })
  roleRef: Role;

  /** The role's key (for example "admin"). Not a column: it is filled from `roleRef` whenever a user is loaded or saved. */
  role: UserRole;

  @AfterLoad()
  @AfterInsert()
  @AfterUpdate()
  private syncRoleKey() {
    if (this.roleRef?.key) this.role = this.roleRef.key as UserRole;
  }

  @Column({ name: 'company_id', type: 'int', nullable: true })
  companyId: number | null;

  @ManyToOne(() => Company, { nullable: true, eager: false })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  /** Generated, for example USR-0001. */
  @Column({ name: 'user_code', type: 'varchar', length: 20, nullable: true })
  userCode: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 60, nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 60, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  mobile: string | null;

  @Column({ name: 'alternate_mobile', type: 'varchar', length: 15, nullable: true })
  alternateMobile: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gender: string | null;

  @Column({ name: 'blood_group', type: 'varchar', length: 5, nullable: true })
  bloodGroup: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  designation: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pincode: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  state: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  district: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  landmark: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  address: string | null;

  /** True for a temporary (admin-issued) password: the user must choose their own at first sign-in. */
  @Column({ name: 'must_change_password', default: false })
  mustChangePassword: boolean;

  /** A temporary password stops working after this moment. */
  @Column({ name: 'password_expiry_at', type: 'datetime', nullable: true })
  passwordExpiryAt: Date | null;

  @Column({ name: 'reset_token_hash', type: 'varchar', length: 64, nullable: true })
  resetTokenHash: string | null;

  @Column({ name: 'reset_token_expires', type: 'varchar', length: 40, nullable: true })
  resetTokenExpires: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
