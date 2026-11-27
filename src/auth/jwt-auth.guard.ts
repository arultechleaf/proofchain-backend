import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isSubscriptionExempt } from '../subscriptions/subscription-exempt';

/** Routes a user with a temporary password may still call (they must be able to change it and sign out). */
const ALLOWED_WHILE_PASSWORD_CHANGE_PENDING = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];

/**
 * Routes a signed-in user without a running subscription may still call: their account, the plans and the
 * purchase itself, notifications, and the screen list the app needs to draw its menu.
 */
const ALLOWED_WITHOUT_SUBSCRIPTION = [
  '/api/auth/', '/api/subscriptions/me', '/api/subscriptions/order', '/api/subscriptions/verify',
  '/api/subscription-plans', '/api/notifications', '/api/roles/permissions/me', '/api/payments/razorpay/config',
  '/api/health',
];

/** SUBSCRIPTION_REQUIRED=false switches the subscription check off (everyone keeps access). */
const subscriptionRequired = () => (process.env.SUBSCRIPTION_REQUIRED ?? 'true').trim().toLowerCase() !== 'false';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const result = super.handleRequest(err, user, info, context, status);
    const path = String(context.switchToHttp().getRequest().originalUrl ?? '').split('?')[0];
    if (result?.mustChangePassword) {
      if (!ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.includes(path)) {
        throw new ForbiddenException('PASSWORD_CHANGE_REQUIRED: choose a new password before continuing');
      }
    }
    if (result && subscriptionRequired() && !isSubscriptionExempt(result.role)) {
      const endAt = result.subscriptionEndAt ? new Date(result.subscriptionEndAt).getTime() : 0;
      const allowed = ALLOWED_WITHOUT_SUBSCRIPTION.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));
      if (endAt <= Date.now() && !allowed) {
        throw new ForbiddenException('SUBSCRIPTION_REQUIRED: your subscription has ended or is not active. Choose a plan to continue.');
      }
    }
    return result;
  }
}
