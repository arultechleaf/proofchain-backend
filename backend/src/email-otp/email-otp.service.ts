import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { Repository } from 'typeorm';
import { EmailOtp } from './email-otp.entity';

@Injectable()
export class EmailOtpService {
  private readonly otpLifetimeMs = 5 * 60 * 1000;
  private readonly resendDelayMs = 60 * 1000;
  private readonly maxAttempts = 5;

  constructor(
    @InjectRepository(EmailOtp)
    private readonly otpRepository: Repository<EmailOtp>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Public: send a 6-digit OTP to any email address.
   * The accountType tag keeps OTP rows separate per use-case
   * (e.g. 'customer', 'staff', 'vendor') but defaults to 'general'.
   */
  async sendOtp(
    emailAddress: string,
    accountType: string = 'general',
  ): Promise<void> {
    const email = emailAddress.trim().toLowerCase();

    const now = new Date();
    const existingOtp = await this.otpRepository.findOneBy({
      account_type: accountType,
      email,
    });
    if (
      existingOtp &&
      now.getTime() - existingOtp.sent_at.getTime() < this.resendDelayMs
    ) {
      throw new HttpException(
        'Please wait before requesting another email code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const { transport, from: smtpFrom } = this.smtp();
    const isReset = accountType === 'password-reset';

    const otpData = {
      account_type: accountType,
      email,
      code_hash: this.hashCode(accountType, email, code),
      expires_at: new Date(now.getTime() + this.otpLifetimeMs),
      sent_at: now,
      verified_at: null,
      attempts: 0,
    };
    const previousOtp = existingOtp ? { ...existingOtp } : null;
    const otp = existingOtp
      ? this.otpRepository.merge(existingOtp, otpData)
      : this.otpRepository.create(otpData);
    await this.otpRepository.save(otp);

    try {
      await transport.sendMail({
        from: smtpFrom,
        to: email,
        subject: isReset ? 'Your password reset code' : 'Your IMPL email verification code',
        text: `Your ${isReset ? 'password reset' : 'verification'} code is ${code}. It expires in 5 minutes. If you did not request this, ignore this email.`,
        html: this.createOtpEmailHtml(code, isReset),
      });
    } catch (error) {
      if (previousOtp) {
        await this.otpRepository.save(previousOtp);
      } else {
        await this.otpRepository.remove(otp);
      }
      throw error;
    }
  }

  private smtp() {
    const port = Number(this.configService.get('SMTP_PORT') ?? 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new InternalServerErrorException('SMTP_PORT is invalid');
    }

    const smtpPassword =
      this.configService.get<string>('SMTP_PASSWORD') ??
      this.configService.getOrThrow<string>('SMTP_PASS');
    const from =
      this.configService.get<string>('SMTP_FROM') ??
      this.configService.getOrThrow<string>('SMTP_USER');
    const transport = createTransport({
      host: this.configService.getOrThrow<string>('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: {
        user: this.configService.getOrThrow<string>('SMTP_USER'),
        pass: smtpPassword,
      },
    });
    return { transport, from };
  }

  /**
   * Public: verify a 6-digit OTP for any email address.
   */
  async verifyOtp(
    emailAddress: string,
    code: string,
    accountType: string = 'general',
  ): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    const otp = await this.otpRepository.findOneBy({
      account_type: accountType,
      email,
    });
    if (!otp) {
      throw new UnauthorizedException('No active verification code found');
    }
    if (otp.verified_at) {
      throw new UnprocessableEntityException('Email has already been verified');
    }
    if (otp.expires_at.getTime() <= Date.now()) {
      await this.otpRepository.remove(otp);
      throw new UnauthorizedException('Verification code has expired');
    }
    if (otp.attempts >= this.maxAttempts) {
      await this.otpRepository.remove(otp);
      throw new HttpException(
        'Too many invalid attempts; request a new verification code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expectedHash = Buffer.from(otp.code_hash, 'hex');
    const actualHash = Buffer.from(this.hashCode(accountType, email, code), 'hex');
    if (
      expectedHash.length !== actualHash.length ||
      !timingSafeEqual(expectedHash, actualHash)
    ) {
      otp.attempts += 1;
      await this.otpRepository.save(otp);
      throw new UnauthorizedException('Verification code is incorrect');
    }

    otp.verified_at = new Date();
    otp.expires_at = new Date(otp.verified_at.getTime() + this.otpLifetimeMs);
    await this.otpRepository.save(otp);
  }

  /**
   * Used internally by other modules (e.g. customer-registration)
   * to assert that an email was verified before proceeding.
   */
  async assertEmailVerified(
    emailAddress: string,
    accountType: string = 'general',
  ): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    const otp = await this.otpRepository.findOneBy({
      account_type: accountType,
      email,
    });
    if (!otp?.verified_at || otp.expires_at.getTime() <= Date.now()) {
      if (otp?.verified_at) await this.otpRepository.remove(otp);
      throw new UnauthorizedException('Verify the email OTP before proceeding');
    }
  }

  /**
   * Used internally by other modules (e.g. customer-registration)
   * to consume (delete) a verified OTP after successful registration.
   */
  async consumeVerifiedOtp(
    emailAddress: string,
    accountType: string = 'general',
  ): Promise<void> {
    const email = emailAddress.trim().toLowerCase();
    const otp = await this.otpRepository.findOneBy({
      account_type: accountType,
      email,
    });
    if (!otp?.verified_at || otp.expires_at.getTime() <= Date.now()) {
      if (otp?.verified_at) await this.otpRepository.remove(otp);
      throw new UnauthorizedException('Verify the email OTP before proceeding');
    }
    await this.otpRepository.remove(otp);
  }

  private hashCode(
    accountType: string,
    email: string,
    code: string,
  ): string {
    const secret = this.configService.getOrThrow<string>('OTP_SECRET');
    return createHmac('sha256', secret)
      .update(`${accountType}:${email}:${code}`)
      .digest('hex');
  }

  private createOtpEmailHtml(code: string, isReset = false): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    @keyframes appear { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes glow { 0%, 100% { box-shadow: 0 8px 24px rgba(13, 110, 253, .12); } 50% { box-shadow: 0 8px 32px rgba(13, 110, 253, .3); } }
    body { margin: 0; padding: 24px; background: #f3f6fb; color: #17243a; font-family: Arial, sans-serif; }
    .card { max-width: 480px; margin: 24px auto; padding: 36px 28px; background: #fff; border-radius: 18px; text-align: center; animation: appear .6s ease-out both; }
    .brand { color: #0d6efd; font-size: 14px; font-weight: 700; letter-spacing: 3px; }
    .code { display: inline-block; margin: 20px 0; padding: 16px 24px; border-radius: 12px; background: #edf4ff; color: #0d6efd; font-size: 32px; font-weight: 700; letter-spacing: 9px; animation: glow 2s ease-in-out infinite; }
    .muted { color: #617089; font-size: 14px; line-height: 1.6; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; } }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">IMPL</div>
    <h1>${isReset ? 'Password reset' : 'Email verification'}</h1>
    <p class="muted">${isReset ? 'Enter this one-time code to reset your password.' : 'Enter this one-time code to verify your email address.'}</p>
    <div class="code">${code}</div>
    <p class="muted">This code expires in 5 minutes and can only be used once.</p>
    <p class="muted">If you did not request this code, you can safely ignore this email.</p>
  </main>
</body>
</html>`;
  }
}
