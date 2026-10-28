import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from '../users/user.entity';

export type AccessLevel = 'full' | 'own' | 'read' | 'none';
export const ACCESS_LEVELS: AccessLevel[] = ['full', 'own', 'read', 'none'];
export const ROLE_KEYS = Object.values(UserRole) as string[];

/** One row per (role, area): how much that role may do in that part of the app. */
@Entity('role_permissions')
@Index(['role', 'area'], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  role: string;

  @Column({ type: 'varchar', length: 40 })
  area: string;

  @Column({ type: 'varchar', length: 10 })
  level: AccessLevel;

  @Column({ name: 'updated_by', type: 'varchar', length: 36, nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** The areas of the app, in display order. */
export const AREAS: Array<{ key: string; label: string }> = [
  { key: 'masters', label: 'Customers, suppliers & items' },
  { key: 'billing', label: 'Sales & purchase documents' },
  { key: 'quotations', label: 'Quotations & estimates' },
  { key: 'payments', label: 'Payments & accounts' },
  { key: 'cash_bank', label: 'Cash & bank' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'reports', label: 'Reports' },
  { key: 'deliveries_create', label: 'Create deliveries' },
  { key: 'deliveries_approve', label: 'Approve / reject deliveries' },
  { key: 'verification', label: 'Verify proofs & blockchain explorer' },
  { key: 'audit', label: 'Audit logs' },
  { key: 'organizations', label: 'Organizations' },
  { key: 'users', label: 'Users & roles' },
];

const BUSINESS: Record<string, AccessLevel> = { admin: 'full', company_a: 'own', company_b: 'own', auditor: 'read' };
const ADMIN_READ: Record<string, AccessLevel> = { admin: 'full', company_a: 'none', company_b: 'none', auditor: 'read' };

/** What each role gets until an administrator changes it. */
export const DEFAULT_LEVELS: Record<string, Record<string, AccessLevel>> = {
  masters: BUSINESS,
  billing: BUSINESS,
  quotations: BUSINESS,
  payments: BUSINESS,
  cash_bank: BUSINESS,
  expenses: BUSINESS,
  reports: BUSINESS,
  deliveries_create: { admin: 'full', company_a: 'full', company_b: 'none', auditor: 'none' },
  deliveries_approve: { admin: 'full', company_a: 'none', company_b: 'full', auditor: 'none' },
  verification: { admin: 'full', company_a: 'full', company_b: 'full', auditor: 'full' },
  audit: ADMIN_READ,
  organizations: ADMIN_READ,
  users: ADMIN_READ,
};
