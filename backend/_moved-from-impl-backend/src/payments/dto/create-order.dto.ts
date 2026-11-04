import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  Matches,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
 
export class CreateOrderDto {
  @IsIn(['STAFF', 'CUSTOMER'])
  payer_type: 'STAFF' | 'CUSTOMER';
 
  // STAFF: role being appointed, so the hierarchy is checked BEFORE taking money
  @ValidateIf((o) => o.payer_type === 'STAFF')
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  role_id?: number;
 
  // STAFF + CUSTOMER: referrer's referral code (e.g. implsm260003, impli260001).
  // Same value that will be sent to /staff/create or /customers/create.
  // Required for STAFF; optional for CUSTOMER (empty = the logged-in user refers)
  @ValidateIf((o) => o.payer_type === 'STAFF' || o.referrer_staff_code !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  referrer_staff_code?: string;
 
  // STAFF + CUSTOMER: checked BEFORE payment, so nobody pays with an already registered email/mobile
  @IsOptional()
  @IsEmail()
  email?: string;
 
  @IsOptional()
  @Matches(/^[6-9]\d{9}$/, { message: 'mobile_number must be a valid 10-digit number' })
  mobile_number?: string;
 
}