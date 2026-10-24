import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { createTransport } from 'nodemailer';
import { Repository } from 'typeorm';
import { vi } from 'vitest';
import { EmailOtp } from './email-otp.entity';
import { EmailOtpService } from './email-otp.service';

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}));

describe('EmailOtpService', () => {
  it('creates an OTP and sends the animated email through a mocked SMTP transport', async () => {
    const email = 'customer@example.com';
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'test-message' });
    vi.mocked(createTransport).mockReturnValue({ sendMail } as never);

    const otpRepository = {
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn((value) => value),
      save: vi.fn((value) => Promise.resolve(value)),
      remove: vi.fn((value) => Promise.resolve(value)),
    };
    const configService = {
      get: vi.fn((_key: string, fallback?: unknown) => fallback),
      getOrThrow: vi.fn((key: string) => {
        const config: Record<string, string> = {
          SMTP_HOST: 'smtp.example.com',
          SMTP_USER: 'sender@example.com',
          SMTP_PASS: 'test-password',
          OTP_SECRET: 'test-only-otp-secret',
        };
        return config[key];
      }),
    };
    const service = new EmailOtpService(
      otpRepository as unknown as Repository<EmailOtp>,
      configService as unknown as ConfigService,
    );

    await expect(service.sendOtp(email)).resolves.toBeUndefined();
    expect(otpRepository.save).toHaveBeenCalledTimes(1);
    expect(
      Math.abs(
        otpRepository.save.mock.calls[0][0].expires_at.getTime() -
          Date.now() -
          5 * 60 * 1000,
      ),
    ).toBeLessThan(1000);
    expect(otpRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ account_type: 'general', email }),
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        auth: { user: 'sender@example.com', pass: 'test-password' },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: email,
        html: expect.stringContaining('@keyframes'),
        text: expect.stringMatching(/verification code is \d{6}/),
      }),
    );
  });

  it('restores the previous OTP if email delivery fails', async () => {
    const email = 'customer@example.com';
    const existingOtp: EmailOtp = {
      id: 1,
      account_type: 'general',
      email,
      code_hash: 'a'.repeat(64),
      expires_at: new Date(Date.now() + 60_000),
      sent_at: new Date(Date.now() - 61_000),
      verified_at: null,
      attempts: 2,
    };
    const previousOtp = { ...existingOtp };
    const sendMail = vi.fn().mockRejectedValue(new Error('SMTP unavailable'));
    vi.mocked(createTransport).mockReturnValue({ sendMail } as never);

    const otpRepository = {
      findOneBy: vi.fn().mockResolvedValue(existingOtp),
      merge: vi.fn((target, value) => Object.assign(target, value)),
      save: vi.fn((value) => Promise.resolve(value)),
      remove: vi.fn((value) => Promise.resolve(value)),
    };
    const configService = {
      get: vi.fn((_key: string, fallback?: unknown) => fallback),
      getOrThrow: vi.fn((key: string) => ({
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'sender@example.com',
        SMTP_PASS: 'test-password',
        OTP_SECRET: 'test-only-otp-secret',
      })[key]),
    };
    const service = new EmailOtpService(
      otpRepository as unknown as Repository<EmailOtp>,
      configService as unknown as ConfigService,
    );

    await expect(service.sendOtp(email)).rejects.toThrow('SMTP unavailable');
    expect(otpRepository.save).toHaveBeenNthCalledWith(2, previousOtp);
  });

  it('marks a valid OTP as verified', async () => {
    const secret = 'test-only-otp-secret';
    const email = 'customer@example.com';
    const code = '012345';
    const otp: Partial<EmailOtp> = {
      account_type: 'general',
      email,
      code_hash: createHmac('sha256', secret)
        .update(`general:${email}:${code}`)
        .digest('hex'),
      expires_at: new Date(Date.now() + 60_000),
      sent_at: new Date(),
      verified_at: null,
      attempts: 0,
    };
    const otpRepository = {
      findOneBy: vi.fn().mockResolvedValue(otp),
      save: vi.fn().mockResolvedValue(otp),
    };
    const configService = {
      getOrThrow: vi.fn().mockReturnValue(secret),
    };
    const service = new EmailOtpService(
      otpRepository as unknown as Repository<EmailOtp>,
      configService as unknown as ConfigService,
    );

    await expect(
      service.verifyOtp(email, code),
    ).resolves.toBeUndefined();
    expect(otp.verified_at).toBeInstanceOf(Date);
    expect(otpRepository.save).toHaveBeenCalledWith(otp);
  });

  it('keeps a verified OTP for an unregistered email until registration', async () => {
    const secret = 'test-only-otp-secret';
    const email = 'new-customer@example.com';
    const code = '012345';
    const otp: Partial<EmailOtp> = {
      account_type: 'general',
      email,
      code_hash: createHmac('sha256', secret)
        .update(`general:${email}:${code}`)
        .digest('hex'),
      expires_at: new Date(Date.now() + 60_000),
      sent_at: new Date(),
      verified_at: null,
      attempts: 0,
    };
    const otpRepository = {
      findOneBy: vi.fn().mockResolvedValue(otp),
      save: vi.fn().mockImplementation((value) => Promise.resolve(value)),
    };
    const service = new EmailOtpService(
      otpRepository as unknown as Repository<EmailOtp>,
      { getOrThrow: vi.fn().mockReturnValue(secret) } as unknown as ConfigService,
    );

    await expect(service.verifyOtp(email, code)).resolves.toBeUndefined();
    expect(otp.verified_at).toBeInstanceOf(Date);
    expect(otpRepository.save).toHaveBeenCalledWith(otp);
  });
});
