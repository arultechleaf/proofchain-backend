import { IsEmail, Matches } from 'class-validator';

export class VerifyEmailOtpDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/)
  otp: string;
}
