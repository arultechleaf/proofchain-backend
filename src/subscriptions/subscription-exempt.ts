/** Roles that never need a subscription. SUBSCRIPTION_EXEMPT_ROLES overrides the list (comma-separated). */
export function exemptRoles(): string[] {
  return (process.env.SUBSCRIPTION_EXEMPT_ROLES ?? 'admin,customer,shop_owner,shop_worker')
    .split(',').map((r) => r.trim()).filter(Boolean);
}

/** True when this role is exempt: no subscription check, purchase, assignment or calculation applies to it. */
export function isSubscriptionExempt(role: string | null | undefined): boolean {
  return !!role && exemptRoles().includes(role);
}
