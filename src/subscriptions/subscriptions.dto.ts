import { Transform, Type } from 'class-transformer';
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { DURATION_TYPES, DurationType } from './subscription.entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreatePlanDto {
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  planName: string;

  /** Short unique code, e.g. PREMIUM_1Y. Made from the name when left out. */
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString() @Matches(/^[A-Z0-9_-]{2,50}$/, { message: 'Plan code: 2-50 letters, digits, _ or -' })
  planCode?: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(3650)
  durationValue: number;

  @IsIn(DURATION_TYPES)
  durationType: DurationType;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999)
  price: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  discountPercentage?: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  description?: string;

  /** 1 = shown to customers, 0 = hidden. */
  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: number;
}

export class UpdatePlanDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(100)
  planName?: string;

  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString() @Matches(/^[A-Z0-9_-]{2,50}$/, { message: 'Plan code: 2-50 letters, digits, _ or -' })
  planCode?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(3650)
  durationValue?: number;

  @IsOptional() @IsIn(DURATION_TYPES)
  durationType?: DurationType;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999)
  price?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100)
  discountPercentage?: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @Type(() => Number) @IsIn([0, 1])
  status?: number;
}

export class CreateSubscriptionOrderDto {
  @Type(() => Number) @IsInt()
  planId: number;
}

export class VerifySubscriptionPaymentDto {
  @IsString() @MaxLength(64)
  orderId: string;

  @IsString() @MaxLength(64)
  paymentId: string;

  @IsString() @MaxLength(128)
  signature: string;
}

/** An administrator gives a user a plan, e.g. after a cash or bank-transfer payment. */
export class AssignSubscriptionDto {
  @Type(() => Number) @IsInt()
  userId: number;

  @Type(() => Number) @IsInt()
  planId: number;

  /** Defaults to the plan's current final price. 0 for a free/complimentary plan. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  amountPaid?: number;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(255)
  note?: string;
}

export class SubscriptionQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsIn(['active', 'expired', 'cancelled'])
  status?: 'active' | 'expired' | 'cancelled';

  @IsOptional() @Type(() => Number) @IsInt()
  userId?: number;
}
