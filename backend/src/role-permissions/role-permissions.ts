import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type AccessLevel = 'full' | 'own' | 'read' | 'none';
export const ACCESS_LEVELS: AccessLevel[] = ['full', 'own', 'read', 'none'];

/** Rank used when a request is allowed by any of several screens: the highest level wins. */
export const LEVEL_RANK: Record<AccessLevel, number> = { none: 0, read: 1, own: 2, full: 3 };

/** A role a user can have (`users.role` holds its key). */
@Entity('roles')
@Index(['key'], { unique: true })
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30 })
  key: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description: string | null;

  /** Built-in roles cannot be deleted. */
  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

/** One registered screen of the application; the sidebar and route guard are built from these rows. */
@Entity('screens')
@Index(['key'], { unique: true })
export class Screen {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 40 })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  path: string;

  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ name: 'screen_group', type: 'varchar', length: 40 })
  group: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** Hidden screens (and their routes) are not offered to anyone. */
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** One row per (role, screen): how much that role may do on that screen. Both sides are stored as numbers (roles.id, screens.id). */
@Entity('role_permissions')
@Index(['roleId', 'screenId'], { unique: true })
export class RolePermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'role_id', type: 'int' })
  roleId: number;

  @Column({ name: 'screen_id', type: 'int' })
  screenId: number;

  @Column({ type: 'varchar', length: 10 })
  level: AccessLevel;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/**
 * A screen access level given to one particular user. It overrides the level their role gives on that screen
 * (no row = the user simply gets what their role gets).
 */
@Entity('user_screen_permissions')
@Index(['userId', 'screenId'], { unique: true })
export class UserScreenPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'screen_id', type: 'int' })
  screenId: number;

  @Column({ type: 'varchar', length: 10 })
  level: AccessLevel;

  @Column({ name: 'updated_by', type: 'int', nullable: true })
  updatedBy: number | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export const SYSTEM_ROLES: Array<{ key: string; name: string; description: string }> = [
  { key: 'admin', name: 'Administrator', description: 'Full access, manages users, roles and organizations' },
  { key: 'manager', name: 'Manager', description: 'Runs day-to-day billing and deliveries for an organization' },
  { key: 'auditor', name: 'Auditor', description: 'Read-only access across organizations, plus audit logs' },
  { key: 'user', name: 'User', description: 'Limited access to own records' },
  { key: 'company_a', name: 'Company A (Sender)', description: 'Sender organization: creates deliveries' },
  { key: 'company_b', name: 'Company B (Receiver)', description: 'Receiver organization: approves deliveries' },
];

interface ScreenDef { key: string; path: string; label: string; group: string }

/** Every screen of the app, in sidebar order. `path` is matched by prefix, so the longest match wins. */
export const SCREEN_DEFS: ScreenDef[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard', group: 'Overview' },
  { key: 'notifications', path: '/notifications', label: 'Notifications', group: 'Overview' },
  { key: 'billing', path: '/billing', label: 'Billing overview', group: 'Sales & purchases' },
  { key: 'sales', path: '/sales', label: 'Sales', group: 'Sales & purchases' },
  { key: 'sales_create', path: '/sales/create', label: 'Create sale', group: 'Sales & purchases' },
  { key: 'quotations', path: '/quotations', label: 'Quotations & estimates', group: 'Sales & purchases' },
  { key: 'purchases', path: '/purchases', label: 'Purchases', group: 'Sales & purchases' },
  { key: 'purchases_create', path: '/purchases/create', label: 'Create purchase', group: 'Sales & purchases' },
  { key: 'payments', path: '/payments', label: 'Payments', group: 'Sales & purchases' },
  { key: 'parties', path: '/parties', label: 'Customers & suppliers', group: 'Parties & stock' },
  { key: 'items', path: '/items', label: 'Items', group: 'Parties & stock' },
  { key: 'inventory', path: '/inventory', label: 'Inventory', group: 'Parties & stock' },
  { key: 'expenses', path: '/expenses', label: 'Expenses', group: 'Accounts' },
  { key: 'cash_bank', path: '/cash-bank', label: 'Cash & bank', group: 'Accounts' },
  { key: 'accounts', path: '/accounts', label: 'Accounts', group: 'Accounts' },
  { key: 'reports', path: '/reports', label: 'Reports', group: 'Accounts' },
  { key: 'deliveries', path: '/deliveries', label: 'Deliveries', group: 'Deliveries & proof' },
  { key: 'deliveries_create', path: '/deliveries/create', label: 'Create delivery', group: 'Deliveries & proof' },
  { key: 'approvals', path: '/approvals', label: 'Approvals', group: 'Deliveries & proof' },
  { key: 'verification', path: '/verification', label: 'Verification', group: 'Deliveries & proof' },
  { key: 'explorer', path: '/explorer', label: 'Blockchain explorer', group: 'Deliveries & proof' },
  { key: 'audit', path: '/audit', label: 'Audit logs', group: 'Administration' },
  { key: 'organizations', path: '/organizations', label: 'Organizations', group: 'Administration' },
  { key: 'users', path: '/users', label: 'Users', group: 'Administration' },
  { key: 'roles', path: '/roles', label: 'Roles & permissions', group: 'Administration' },
  { key: 'settings', path: '/settings', label: 'Settings', group: 'Administration' },
  { key: 'profile', path: '/profile', label: 'My profile', group: 'Administration' },
];

type RoleLevels = [admin: AccessLevel, manager: AccessLevel, auditor: AccessLevel, user: AccessLevel, companyA: AccessLevel, companyB: AccessLevel];
const ROLE_ORDER = ['admin', 'manager', 'auditor', 'user', 'company_a', 'company_b'];

/**
 * What each role gets until an administrator changes it (order: admin, manager, auditor, user, company A, company B).
 * "own" = read and write, limited to the user's own organization; "read" = view only (still limited to their organization,
 * except auditors who see all).
 */
const DEFAULTS: Record<string, RoleLevels> = {
  dashboard:         ['full', 'read', 'read', 'read', 'read', 'read'],
  notifications:     ['full', 'full', 'full', 'full', 'full', 'full'],
  billing:           ['full', 'full', 'read', 'none', 'own', 'own'],
  sales:             ['full', 'full', 'read', 'read', 'own', 'own'],
  sales_create:      ['full', 'full', 'none', 'none', 'full', 'full'],
  quotations:        ['full', 'full', 'read', 'none', 'own', 'own'],
  purchases:         ['full', 'full', 'read', 'none', 'own', 'own'],
  purchases_create:  ['full', 'full', 'none', 'none', 'full', 'full'],
  payments:          ['full', 'full', 'read', 'none', 'own', 'own'],
  parties:           ['full', 'full', 'read', 'read', 'own', 'own'],
  items:             ['full', 'full', 'read', 'read', 'own', 'own'],
  inventory:         ['full', 'full', 'read', 'read', 'own', 'own'],
  expenses:          ['full', 'full', 'read', 'none', 'own', 'own'],
  cash_bank:         ['full', 'full', 'read', 'none', 'own', 'own'],
  accounts:          ['full', 'full', 'read', 'none', 'own', 'own'],
  reports:           ['full', 'full', 'read', 'none', 'own', 'own'],
  deliveries:        ['full', 'full', 'read', 'read', 'own', 'own'],
  deliveries_create: ['full', 'full', 'none', 'none', 'full', 'none'],
  approvals:         ['full', 'full', 'none', 'none', 'none', 'full'],
  verification:      ['full', 'read', 'full', 'read', 'full', 'full'],
  explorer:          ['full', 'read', 'full', 'read', 'full', 'full'],
  audit:             ['full', 'none', 'full', 'none', 'none', 'none'],
  organizations:     ['full', 'none', 'read', 'none', 'none', 'none'],
  users:             ['full', 'none', 'read', 'none', 'none', 'none'],
  roles:             ['full', 'none', 'none', 'none', 'none', 'none'],
  settings:          ['full', 'read', 'read', 'read', 'read', 'read'],
  profile:           ['full', 'full', 'full', 'full', 'full', 'full'],
};

/** Default level for a role on a screen. Roles created later start with no access (except profile and notifications). */
export function defaultLevel(screenKey: string, roleKey: string): AccessLevel {
  const row = DEFAULTS[screenKey];
  const i = ROLE_ORDER.indexOf(roleKey);
  if (row && i >= 0) return row[i];
  return screenKey === 'profile' || screenKey === 'notifications' ? 'full' : 'none';
}

/** Pick the screen whose path is the longest prefix of `pathname`. */
export function matchScreen<T extends { path: string }>(screens: T[], pathname: string): T | undefined {
  let best: T | undefined;
  for (const s of screens) {
    if (pathname === s.path || pathname.startsWith(s.path + '/')) {
      if (!best || s.path.length > best.path.length) best = s;
    }
  }
  return best;
}
