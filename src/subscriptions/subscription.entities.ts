import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, ValueTransformer,
} from 'typeorm';

/** MySQL returns DECIMAL columns as text; the app works with numbers. */
const decimal: ValueTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | number | null) => (v === null || v === undefined ? v : Number(v)),
};

export const DURATION_TYPES = ['DAYS', 'MONTHS', 'YEARS'] as const;
export type DurationType = (typeof DURATION_TYPES)[number];

export type UserSubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type SubscriptionPaymentStatus = 'created' | 'paid' | 'failed';

/** A plan the administrator sells. Prices live here (never in code) and can be changed at any time. */
@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_name', type: 'varchar', length: 100 })
  planName: string;

  @Index({ unique: true })
  @Column({ name: 'plan_code', type: 'varchar', length: 50 })
  planCode: string;

  @Column({ name: 'duration_value', type: 'int' })
  durationValue: number;

  @Column({ name: 'duration_type', type: 'varchar', length: 10 })
  durationType: DurationType;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimal })
  price: number;

  @Column({ name: 'discount_percentage', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimal })
  discountPercentage: number;

  /** Calculated by the server: price minus the discount. */
  @Column({ name: 'final_price', type: 'decimal', precision: 12, scale: 2, default: 0, transformer: decimal })
  finalPrice: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 1 = offered to customers, 0 = hidden. */
  @Column({ type: 'tinyint', default: 1 })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** One row per price or discount change, so earlier prices are never lost. */
@Entity('subscription_plan_price_history')
@Index(['planId', 'changedAt'])
export class SubscriptionPlanPriceHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  /** Null when the row records the plan being created. */
  @Column({ name: 'old_price', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: decimal })
  oldPrice: number | null;

  @Column({ name: 'new_price', type: 'decimal', precision: 12, scale: 2, transformer: decimal })
  newPrice: number;

  @Column({ name: 'old_discount', type: 'decimal', precision: 5, scale: 2, nullable: true, transformer: decimal })
  oldDiscount: number | null;

  @Column({ name: 'new_discount', type: 'decimal', precision: 5, scale: 2, transformer: decimal })
  newDiscount: number;

  @Column({ name: 'old_final_price', type: 'decimal', precision: 12, scale: 2, nullable: true, transformer: decimal })
  oldFinalPrice: number | null;

  @Column({ name: 'new_final_price', type: 'decimal', precision: 12, scale: 2, transformer: decimal })
  newFinalPrice: number;

  /** Admin user id. */
  @Column({ name: 'changed_by', type: 'int', nullable: true })
  changedBy: number | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;
}

/**
 * A user's subscription. The plan's name, duration and price are copied in when it is bought, so later
 * price changes never touch what an existing subscriber paid.
 */
@Entity('user_subscriptions')
@Index(['userId', 'status'])
@Index(['status', 'endAt'])
export class UserSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ name: 'plan_name', type: 'varchar', length: 100 })
  planName: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 50 })
  planCode: string;

  @Column({ name: 'duration_value', type: 'int' })
  durationValue: number;

  @Column({ name: 'duration_type', type: 'varchar', length: 10 })
  durationType: DurationType;

  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimal })
  price: number;

  @Column({ name: 'discount_percentage', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimal })
  discountPercentage: number;

  /** What the user paid. */
  @Column({ name: 'final_price', type: 'decimal', precision: 12, scale: 2, transformer: decimal })
  finalPrice: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  @Column({ name: 'start_at', type: 'datetime' })
  startAt: Date;

  @Column({ name: 'end_at', type: 'datetime' })
  endAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: UserSubscriptionStatus;

  /** When the "expires in 2 days" notification was sent. */
  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminderSentAt: Date | null;

  @Column({ name: 'payment_id', type: 'int', nullable: true })
  paymentId: number | null;

  /** Set when an administrator gave the plan (e.g. paid in cash) instead of the user paying online. */
  @Column({ name: 'assigned_by', type: 'int', nullable: true })
  assignedBy: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** Money received (or expected) for a subscription. */
@Entity('subscription_payments')
@Index(['userId', 'createdAt'])
export class SubscriptionPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({ name: 'user_subscription_id', type: 'int', nullable: true })
  userSubscriptionId: number | null;

  /** Fixed when the order is made, so a price change during checkout does not change the bill. */
  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimal })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency: string;

  /** razorpay or manual. */
  @Column({ type: 'varchar', length: 20 })
  method: string;

  @Column({ type: 'varchar', length: 20, default: 'created' })
  status: SubscriptionPaymentStatus;

  @Index({ unique: true })
  @Column({ name: 'razorpay_order_id', type: 'varchar', length: 64, nullable: true })
  razorpayOrderId: string | null;

  @Column({ name: 'razorpay_payment_id', type: 'varchar', length: 64, nullable: true })
  razorpayPaymentId: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

export const SUBSCRIPTION_ENTITIES = [SubscriptionPlan, SubscriptionPlanPriceHistory, UserSubscription, SubscriptionPayment];
