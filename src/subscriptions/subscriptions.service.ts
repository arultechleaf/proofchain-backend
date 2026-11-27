import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap, OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, EntityManager, In, IsNull, LessThanOrEqual, MoreThan, Not, Repository } from 'typeorm';
import {
  DurationType, SubscriptionPayment, SubscriptionPlan, SubscriptionPlanPriceHistory, UserSubscription,
} from './subscription.entities';
import {
  AssignSubscriptionDto, CreatePlanDto, SubscriptionQueryDto, UpdatePlanDto, VerifySubscriptionPaymentDto,
} from './subscriptions.dto';
import { User } from '../users/user.entity';
import { AuthUser, round2 } from '../common/tenant';
import { RazorpayService } from '../payments/razorpay.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { isSubscriptionExempt } from './subscription-exempt';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Sample plans created the first time the table is empty. The administrator changes them from the admin page. */
const SAMPLE_PLANS: Array<Pick<SubscriptionPlan, 'planName' | 'planCode' | 'durationValue' | 'durationType' | 'price' | 'discountPercentage' | 'description'>> = [
  { planName: 'Basic', planCode: 'BASIC_30D', durationValue: 30, durationType: 'DAYS', price: 999, discountPercentage: 0, description: 'Try every feature for 30 days.' },
  { planName: 'Standard', planCode: 'STANDARD_3M', durationValue: 3, durationType: 'MONTHS', price: 2999, discountPercentage: 10, description: 'Three months with 10% off.' },
  { planName: 'Premium', planCode: 'PREMIUM_1Y', durationValue: 1, durationType: 'YEARS', price: 9999, discountPercentage: 15, description: 'A full year with 15% off.' },
  { planName: 'Business', planCode: 'BUSINESS_2Y', durationValue: 2, durationType: 'YEARS', price: 15000, discountPercentage: 20, description: 'Two years with 20% off.' },
  { planName: 'Enterprise', planCode: 'ENTERPRISE_5Y', durationValue: 5, durationType: 'YEARS', price: 30000, discountPercentage: 25, description: 'Five years with 25% off.' },
];

export function finalPriceOf(price: number, discountPercentage: number): number {
  return round2(price - (price * discountPercentage) / 100);
}

/** `from` plus the plan's duration. Month and year steps keep the day of month, clamped to the month's length. */
export function addDuration(from: Date, value: number, type: DurationType): Date {
  if (type === 'DAYS') return new Date(from.getTime() + value * DAY_MS);
  const months = type === 'MONTHS' ? value : value * 12;
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

function durationLabel(value: number, type: DurationType): string {
  const unit = type === 'DAYS' ? 'day' : type === 'MONTHS' ? 'month' : 'year';
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

function istDate(d: Date): string {
  return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

@Injectable()
export class SubscriptionsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionsService.name);
  private timer: NodeJS.Timeout | null = null;
  private checking = false;

  constructor(
    @InjectRepository(SubscriptionPlan) private readonly plans: Repository<SubscriptionPlan>,
    @InjectRepository(SubscriptionPlanPriceHistory) private readonly history: Repository<SubscriptionPlanPriceHistory>,
    @InjectRepository(UserSubscription) private readonly subs: Repository<UserSubscription>,
    @InjectRepository(SubscriptionPayment) private readonly payments: Repository<SubscriptionPayment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly razorpay: RazorpayService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // ── startup: sample plans and the reminder / expiry check ──────────────────

  /** Days before the end date when the user is reminded. */
  private get reminderDays(): number {
    return Math.max(1, Number(this.config.get('SUBSCRIPTION_REMINDER_DAYS', 2)) || 2);
  }

  async onApplicationBootstrap() {
    try {
      if ((await this.plans.count()) === 0) {
        for (const p of SAMPLE_PLANS) {
          const plan = await this.plans.save(this.plans.create({ ...p, finalPrice: finalPriceOf(p.price, p.discountPercentage), currency: 'INR', status: 1 }));
          await this.history.save(this.history.create({
            planId: plan.id, oldPrice: null, newPrice: plan.price, oldDiscount: null, newDiscount: plan.discountPercentage,
            oldFinalPrice: null, newFinalPrice: plan.finalPrice, changedBy: null,
          }));
        }
        this.logger.log(`Created ${SAMPLE_PLANS.length} sample subscription plans`);
      }
    } catch (err) {
      this.logger.error(`Subscription tables are not ready (run database/subscriptions.sql): ${(err as Error).message}`);
    }

    const minutes = Math.max(1, Number(this.config.get('SUBSCRIPTION_CHECK_MINUTES', 60)) || 60);
    // first run shortly after start, then on a fixed interval
    setTimeout(() => void this.runChecks(), 30_000).unref();
    this.timer = setInterval(() => void this.runChecks(), minutes * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── plans ─────────────────────────────────────────────────────────────────

  /** Plans customers can buy, cheapest first. */
  listActivePlans() {
    return this.plans.find({ where: { status: 1 }, order: { finalPrice: 'ASC', id: 'ASC' } });
  }

  /** Every plan, hidden ones included (admin). */
  listAllPlans() {
    return this.plans.find({ order: { status: 'DESC', finalPrice: 'ASC', id: 'ASC' } });
  }

  async getPlan(id: number): Promise<SubscriptionPlan> {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  private async assertCodeFree(code: string, exceptId?: number) {
    const clash = await this.plans.findOne({ where: { planCode: code } });
    if (clash && clash.id !== exceptId) throw new ConflictException(`Plan code ${code} is already used by "${clash.planName}"`);
  }

  private codeFromName(name: string, value: number, type: DurationType): string {
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'PLAN';
    return `${base}_${value}${type[0]}`;
  }

  async createPlan(dto: CreatePlanDto, adminId: number) {
    const discount = dto.discountPercentage ?? 0;
    let code = dto.planCode ?? this.codeFromName(dto.planName, dto.durationValue, dto.durationType);
    if (!dto.planCode) {
      // a generated code gets a number added if it is taken
      for (let n = 2; await this.plans.findOne({ where: { planCode: code } }); n += 1) code = `${code.replace(/_\d+$/, '')}_${n}`;
    }
    await this.assertCodeFree(code);
    const plan = await this.plans.save(this.plans.create({
      planName: dto.planName,
      planCode: code,
      durationValue: dto.durationValue,
      durationType: dto.durationType,
      price: round2(dto.price),
      discountPercentage: round2(discount),
      finalPrice: finalPriceOf(dto.price, discount),
      currency: 'INR',
      description: dto.description || null,
      status: dto.status ?? 1,
    }));
    await this.history.save(this.history.create({
      planId: plan.id, oldPrice: null, newPrice: plan.price, oldDiscount: null, newDiscount: plan.discountPercentage,
      oldFinalPrice: null, newFinalPrice: plan.finalPrice, changedBy: adminId,
    }));
    await this.audit.log({ actorId: adminId, action: 'SUBSCRIPTION_PLAN_CREATED', resourceType: 'subscription_plan', resourceId: plan.id, details: { planCode: code, finalPrice: plan.finalPrice } });
    return plan;
  }

  /** Changing the price or discount adds a price-history row. Existing subscribers keep what they paid. */
  async updatePlan(id: number, dto: UpdatePlanDto, adminId: number) {
    const plan = await this.getPlan(id);
    const before = { price: plan.price, discount: plan.discountPercentage, final: plan.finalPrice };
    if (dto.planCode && dto.planCode !== plan.planCode) await this.assertCodeFree(dto.planCode, id);

    if (dto.planName !== undefined) plan.planName = dto.planName;
    if (dto.planCode !== undefined) plan.planCode = dto.planCode;
    if (dto.durationValue !== undefined) plan.durationValue = dto.durationValue;
    if (dto.durationType !== undefined) plan.durationType = dto.durationType;
    if (dto.price !== undefined) plan.price = round2(dto.price);
    if (dto.discountPercentage !== undefined) plan.discountPercentage = round2(dto.discountPercentage);
    if (dto.description !== undefined) plan.description = dto.description || null;
    if (dto.status !== undefined) plan.status = dto.status;
    plan.finalPrice = finalPriceOf(plan.price, plan.discountPercentage);

    await this.plans.manager.transaction(async (m) => {
      await m.save(plan);
      if (before.price !== plan.price || before.discount !== plan.discountPercentage) {
        await m.save(m.create(SubscriptionPlanPriceHistory, {
          planId: plan.id, oldPrice: before.price, newPrice: plan.price, oldDiscount: before.discount,
          newDiscount: plan.discountPercentage, oldFinalPrice: before.final, newFinalPrice: plan.finalPrice, changedBy: adminId,
        }));
      }
    });
    await this.audit.log({ actorId: adminId, action: 'SUBSCRIPTION_PLAN_UPDATED', resourceType: 'subscription_plan', resourceId: plan.id, details: { before, after: { price: plan.price, discount: plan.discountPercentage, final: plan.finalPrice } } });
    return plan;
  }

  /**
   * A plan nobody has bought is deleted. A plan with subscribers is hidden instead (status 0), because their
   * subscriptions and payments point at it.
   */
  async removePlan(id: number, adminId: number): Promise<{ deleted: boolean; hidden: boolean }> {
    const plan = await this.getPlan(id);
    const used = (await this.subs.count({ where: { planId: id } })) + (await this.payments.count({ where: { planId: id } }));
    if (used) {
      plan.status = 0;
      await this.plans.save(plan);
      await this.audit.log({ actorId: adminId, action: 'SUBSCRIPTION_PLAN_HIDDEN', resourceType: 'subscription_plan', resourceId: id, details: { reason: 'has subscribers' } });
      return { deleted: false, hidden: true };
    }
    await this.plans.manager.transaction(async (m) => {
      await m.delete(SubscriptionPlanPriceHistory, { planId: id });
      await m.delete(SubscriptionPlan, { id });
    });
    await this.audit.log({ actorId: adminId, action: 'SUBSCRIPTION_PLAN_DELETED', resourceType: 'subscription_plan', resourceId: id, details: { planCode: plan.planCode } });
    return { deleted: true, hidden: false };
  }

  async priceHistory(planId: number) {
    await this.getPlan(planId);
    const rows = await this.history.find({ where: { planId }, order: { changedAt: 'DESC', id: 'DESC' } });
    const names = await this.userNames(rows.map((r) => r.changedBy));
    return rows.map((r) => ({ ...r, changedByName: r.changedBy ? names.get(r.changedBy) ?? null : null }));
  }

  // ── the signed-in user's subscription ───────────────────────────────────────

  async mySubscription(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    // exempt roles (admin, …) have no subscription: nothing to look up or calculate
    if (isSubscriptionExempt(user.role)) {
      return { status: 'exempt' as const, exempt: true, endAt: null, daysLeft: 0, expiringSoon: false, current: null, upcoming: [], history: [] };
    }
    const now = new Date();
    const history = await this.subs.find({ where: { userId }, order: { startAt: 'DESC', id: 'DESC' }, take: 50 });
    const current = history.find((s) => s.status === 'active' && s.startAt <= now && s.endAt > now) ?? null;
    const upcoming = history.filter((s) => s.status === 'active' && s.startAt > now).sort((a, b) => +a.startAt - +b.startAt);
    const endAt = user.subscriptionEndAt;
    const daysLeft = endAt && endAt > now ? Math.ceil((+endAt - +now) / DAY_MS) : 0;
    return {
      status: user.subscriptionStatus,
      endAt,
      daysLeft,
      expiringSoon: user.subscriptionStatus === 'active' && daysLeft <= this.reminderDays,
      current,
      upcoming,
      history,
    };
  }

  /** Step 1 of an online purchase: a Razorpay order for the plan's price right now. */
  async createOrder(planId: number, user: AuthUser) {
    if (isSubscriptionExempt(user.role)) throw new BadRequestException('Your role does not need a subscription');
    const plan = await this.getPlan(planId);
    if (plan.status !== 1) throw new BadRequestException('This plan is not available any more');
    if (plan.finalPrice < 1) throw new BadRequestException('This plan is free: ask an administrator to activate it for you');
    const order = await this.razorpay.createPlainOrder(plan.finalPrice, `SUB-${user.id}-${plan.planCode}`, {
      purpose: 'subscription', userId: user.id, planId: plan.id, planCode: plan.planCode,
    });
    await this.payments.save(this.payments.create({
      userId: user.id, planId: plan.id, amount: plan.finalPrice, currency: plan.currency, method: 'razorpay',
      status: 'created', razorpayOrderId: order.orderId, createdBy: user.id,
    }));
    const me = await this.users.findOne({ where: { id: user.id } });
    return {
      ...order,
      plan: { id: plan.id, planName: plan.planName, finalPrice: plan.finalPrice, duration: durationLabel(plan.durationValue, plan.durationType) },
      customer: { name: me?.name ?? '', email: me?.email ?? '', contact: me?.mobile ?? '' },
    };
  }

  /** Step 2: check the payment with Razorpay and start the subscription. Safe to repeat. */
  async verifyPayment(dto: VerifySubscriptionPaymentDto, user: AuthUser) {
    const payment = await this.payments.findOne({ where: { razorpayOrderId: dto.orderId } });
    if (!payment || payment.userId !== user.id) throw new BadRequestException('Unknown subscription order');
    if (payment.status === 'paid') return this.mySubscription(user.id);

    await this.razorpay.confirmPlainPayment(dto.orderId, dto.paymentId, dto.signature, payment.amount);
    const plan = await this.getPlan(payment.planId);

    let sub: UserSubscription | null = null;
    await this.payments.manager.transaction(async (m) => {
      // the conditional update makes sure one payment starts one subscription, even if verify runs twice at once
      const claimed = await m.update(SubscriptionPayment, { id: payment.id, status: 'created' }, {
        status: 'paid', razorpayPaymentId: dto.paymentId, paidAt: new Date(),
      });
      if (!claimed.affected) return;
      sub = await this.activate(m, { userId: user.id, plan, paymentId: payment.id, paid: payment.amount, assignedBy: null, note: null });
    });
    if (sub) await this.afterActivation(sub, user.id);
    return this.mySubscription(user.id);
  }

  // ── admin: subscribers ─────────────────────────────────────────────────────

  async listSubscriptions(query: SubscriptionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, total] = await this.subs.findAndCount({
      where: { ...(query.status ? { status: query.status } : {}), ...(query.userId ? { userId: query.userId } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const users = rows.length ? await this.users.find({ where: { id: In([...new Set(rows.map((r) => r.userId))]) } }) : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = rows.map((r) => {
      const u = byId.get(r.userId);
      return { ...r, user: u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null };
    });
    return { data, total, page, limit };
  }

  /** Give a user a plan without online payment (cash, bank transfer, complimentary). */
  async assign(dto: AssignSubscriptionDto, adminId: number) {
    const plan = await this.getPlan(dto.planId);
    const target = await this.users.findOne({ where: { id: dto.userId } });
    if (!target) throw new NotFoundException('User not found');
    if (isSubscriptionExempt(target.role)) throw new BadRequestException(`A ${target.role} user does not need a subscription`);
    const paid = round2(dto.amountPaid ?? plan.finalPrice);

    let sub!: UserSubscription;
    await this.payments.manager.transaction(async (m) => {
      const payment = await m.save(m.create(SubscriptionPayment, {
        userId: target.id, planId: plan.id, amount: paid, currency: plan.currency, method: 'manual',
        status: 'paid', paidAt: new Date(), createdBy: adminId,
      }));
      sub = await this.activate(m, { userId: target.id, plan, paymentId: payment.id, paid, assignedBy: adminId, note: dto.note ?? null });
    });
    await this.afterActivation(sub, adminId);
    return sub;
  }

  async cancel(id: number, adminId: number) {
    const sub = await this.subs.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Subscription not found');
    if (sub.status !== 'active') throw new BadRequestException(`This subscription is already ${sub.status}`);
    await this.subs.manager.transaction(async (m) => {
      await m.update(UserSubscription, { id }, { status: 'cancelled' });
      await this.refreshUser(m, sub.userId);
    });
    await this.notifications.notifyUser(sub.userId, {
      type: 'subscription', title: 'Subscription cancelled',
      message: `Your ${sub.planName} subscription was cancelled by an administrator.`, link: '/subscription',
    });
    await this.audit.log({ actorId: adminId, action: 'SUBSCRIPTION_CANCELLED', resourceType: 'user_subscription', resourceId: id, details: { userId: sub.userId } });
    return { ...sub, status: 'cancelled' as const };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Start a subscription with the plan copied in (price snapshot). A renewal bought before the current one ends
   * starts when it ends, so no paid days are lost.
   */
  private async activate(m: EntityManager, a: {
    userId: number; plan: SubscriptionPlan; paymentId: number; paid: number; assignedBy: number | null; note: string | null;
  }): Promise<UserSubscription> {
    // whole seconds: DATETIME columns round milliseconds, which could put the start a moment in the future
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const latest = await m.findOne(UserSubscription, {
      where: { userId: a.userId, status: 'active', endAt: MoreThan(now) }, order: { endAt: 'DESC' },
    });
    const startAt = latest ? latest.endAt : now;
    // the price the user actually paid is kept; if the plan's price changed during checkout, record what was paid
    const samePrice = a.plan.finalPrice === a.paid;
    const sub = await m.save(m.create(UserSubscription, {
      userId: a.userId,
      planId: a.plan.id,
      planName: a.plan.planName,
      planCode: a.plan.planCode,
      durationValue: a.plan.durationValue,
      durationType: a.plan.durationType,
      price: samePrice ? a.plan.price : a.paid,
      discountPercentage: samePrice ? a.plan.discountPercentage : 0,
      finalPrice: a.paid,
      currency: a.plan.currency,
      startAt,
      endAt: addDuration(startAt, a.plan.durationValue, a.plan.durationType),
      status: 'active',
      paymentId: a.paymentId,
      assignedBy: a.assignedBy,
      note: a.note,
    }));
    await m.update(SubscriptionPayment, { id: a.paymentId }, { userSubscriptionId: sub.id });
    await this.refreshUser(m, a.userId);
    return sub;
  }

  private async afterActivation(sub: UserSubscription, actorId: number) {
    const starts = sub.startAt > new Date() ? ` It starts on ${istDate(sub.startAt)}, after your current plan.` : '';
    await this.notifications.notifyUser(sub.userId, {
      type: 'subscription', title: 'Subscription active',
      message: `${sub.planName} (${durationLabel(sub.durationValue, sub.durationType)}) is active until ${istDate(sub.endAt)}.${starts}`,
      link: '/subscription',
    });
    await this.audit.log({
      actorId, action: sub.assignedBy ? 'SUBSCRIPTION_ASSIGNED' : 'SUBSCRIPTION_PURCHASED', resourceType: 'user_subscription', resourceId: sub.id,
      details: { userId: sub.userId, planCode: sub.planCode, finalPrice: sub.finalPrice, endAt: sub.endAt },
    });
  }

  /** Copy the user's subscription state onto the users row (what sign-in checks use). */
  private async refreshUser(m: EntityManager, userId: number) {
    const now = new Date();
    const live = await m.find(UserSubscription, { where: { userId, status: 'active', endAt: MoreThan(now) }, order: { startAt: 'ASC' } });
    if (live.length) {
      const current = live.find((s) => s.startAt <= now) ?? live[0];
      const endAt = live.reduce((max, s) => (s.endAt > max ? s.endAt : max), live[0].endAt);
      await m.update(User, { id: userId }, { subscriptionStatus: 'active', subscriptionPlanId: current.planId, subscriptionEndAt: endAt });
      return;
    }
    const last = await m.findOne(UserSubscription, { where: { userId, status: Not('cancelled') }, order: { endAt: 'DESC' } });
    const ever = last ?? (await m.findOne(UserSubscription, { where: { userId } }));
    await m.update(User, { id: userId }, {
      subscriptionStatus: ever ? 'expired' : 'none',
      subscriptionPlanId: last?.planId ?? null,
      subscriptionEndAt: last && last.endAt <= now ? last.endAt : null,
    });
  }

  /** Runs every hour: remind users whose subscription ends within the reminder window, and expire ended ones. */
  async runChecks(): Promise<{ reminded: number; expired: number }> {
    if (this.checking) return { reminded: 0, expired: 0 };
    this.checking = true;
    let reminded = 0;
    let expired = 0;
    try {
      const now = new Date();
      const soon = new Date(now.getTime() + this.reminderDays * DAY_MS);

      // 1. reminders
      const ending = await this.subs.find({ where: { status: 'active', endAt: Between(now, soon), reminderSentAt: IsNull() } });
      for (const sub of ending) {
        const user = await this.users.findOne({ where: { id: sub.userId } });
        // already renewed: access goes on past this subscription, so no reminder is needed
        const renewed = !!user?.subscriptionEndAt && user.subscriptionEndAt.getTime() > sub.endAt.getTime() + 60_000;
        if (user && !renewed) {
          const days = Math.max(1, Math.ceil((sub.endAt.getTime() - now.getTime()) / DAY_MS));
          await this.notifications.notifyUser(sub.userId, {
            type: 'subscription',
            title: `Subscription ends in ${days} day${days === 1 ? '' : 's'}`,
            message: `Your ${sub.planName} subscription ends on ${istDate(sub.endAt)}. Renew now to keep using the app without a break.`,
            link: '/subscription',
          });
          reminded += 1;
        }
        await this.subs.update({ id: sub.id }, { reminderSentAt: now });
      }

      // 2. expiry
      const ended = await this.subs.find({ where: { status: 'active', endAt: LessThanOrEqual(now) } });
      const userIds = [...new Set(ended.map((s) => s.userId))];
      if (ended.length) await this.subs.update({ id: In(ended.map((s) => s.id)) }, { status: 'expired' });
      expired = ended.length;
      for (const userId of userIds) {
        await this.subs.manager.transaction((m) => this.refreshUser(m, userId));
        const user = await this.users.findOne({ where: { id: userId } });
        if (user?.subscriptionStatus === 'expired') {
          const planName = ended.find((s) => s.userId === userId)?.planName ?? 'Your';
          await this.notifications.notifyUser(userId, {
            type: 'subscription', title: 'Subscription expired',
            message: `${planName} subscription has ended. Choose a plan to continue using the app.`, link: '/subscription',
          });
        }
      }
      if (reminded || expired) this.logger.log(`Subscription check: ${reminded} reminded, ${expired} expired`);
    } catch (err) {
      this.logger.error(`Subscription check failed: ${(err as Error).message}`);
    } finally {
      this.checking = false;
    }
    return { reminded, expired };
  }

  private async userNames(ids: Array<number | null>) {
    const unique = [...new Set(ids.filter((x): x is number => !!x))];
    if (!unique.length) return new Map<number, string>();
    const rows = await this.users.find({ where: { id: In(unique) }, select: { id: true, name: true } });
    return new Map(rows.map((u) => [u.id, u.name]));
  }
}
