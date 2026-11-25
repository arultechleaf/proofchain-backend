import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  companyId: number | null;
  name: string;
}

/** Company filter for reads. Admins and auditors see every company; others only their own. */
export function readScope(user: AuthUser): number | undefined {
  if (user.role === 'admin' || user.role === 'auditor') return undefined;
  // ids start at 1, so 0 matches no company for an account that has none
  return user.companyId ?? 0;
}

/** Company that owns new records. Auditors are read-only; the user must belong to a company. */
export function writeCompanyId(user: AuthUser): number {
  if (user.role === 'auditor') {
    throw new ForbiddenException('Auditors have read-only access');
  }
  if (!user.companyId) {
    throw new BadRequestException(
      'Your account is not linked to an organization, so it cannot create billing records',
    );
  }
  return user.companyId;
}

/** Throws 404 when a record belongs to another company. */
export function assertAccess(recordCompanyId: number, user: AuthUser, what = 'Record'): void {
  const scope = readScope(user);
  if (scope !== undefined && scope !== recordCompanyId) throw new NotFoundException(`${what} not found`);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
