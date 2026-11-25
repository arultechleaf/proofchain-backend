import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

/** Indian mobile number: 10 digits starting with 6-9. */
export const MOBILE_PATTERN = /^[6-9]\d{9}$/;
export const PINCODE_PATTERN = /^\d{6}$/;

/** The personal, contact, work and address details collected when an account is created. */
export class UserProfileFields {
  @IsOptional() @IsString() @MaxLength(60)
  firstName?: string;

  @IsOptional() @IsString() @MaxLength(60)
  lastName?: string;

  @IsOptional() @IsString() @Matches(MOBILE_PATTERN, { message: 'Enter a valid 10-digit mobile number' })
  mobile?: string;

  @IsOptional() @IsString() @Matches(MOBILE_PATTERN, { message: 'Enter a valid 10-digit alternate mobile number' })
  alternateMobile?: string;

  @IsOptional() @IsDateString({}, { message: 'Date of birth must be a valid date' })
  dateOfBirth?: string;

  @IsOptional() @IsIn(GENDERS as unknown as string[])
  gender?: string;

  @IsOptional() @IsIn(BLOOD_GROUPS as unknown as string[])
  bloodGroup?: string;

  @IsOptional() @IsString() @MaxLength(100)
  designation?: string;

  @IsOptional() @IsString() @Matches(PINCODE_PATTERN, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @IsOptional() @IsString() @MaxLength(80)
  state?: string;

  @IsOptional() @IsString() @MaxLength(80)
  district?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MaxLength(150)
  landmark?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;
}

/** Columns copied from the profile DTO onto the user row ('' is stored as NULL). */
export const PROFILE_KEYS = [
  'firstName', 'lastName', 'mobile', 'alternateMobile', 'dateOfBirth', 'gender', 'bloodGroup', 'designation',
  'pincode', 'state', 'district', 'city', 'landmark', 'address',
] as const;

export function profileValues(dto: Partial<Record<(typeof PROFILE_KEYS)[number], string | undefined>>) {
  const out: Record<string, string | null> = {};
  for (const k of PROFILE_KEYS) {
    const v = dto[k];
    if (v !== undefined) out[k] = v.trim() === '' ? null : v.trim();
  }
  return out;
}

/** Throws a message when the date of birth is in the future or implausibly old. */
export function dobProblem(dob?: string | null): string | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 'Date of birth must be a valid date';
  const now = new Date();
  if (d > now) return 'Date of birth cannot be in the future';
  if (now.getFullYear() - d.getFullYear() > 120) return 'Date of birth is not valid';
  return null;
}
