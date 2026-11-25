import axios, { AxiosInstance } from 'axios';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';
import { RazorpayXService } from './razorpayx.service';

vi.mock('axios', () => ({
  default: { create: vi.fn() },
  isAxiosError: vi.fn(),
}));

describe('RazorpayXService', () => {
  const configValues: Record<string, string> = {
    RAZORPAYX_PAYOUTS_ENABLED: 'true',
    RAZORPAYX_KEY_ID: 'rzp_test_example',
    RAZORPAYX_KEY_SECRET: 'test-secret',
    RAZORPAYX_ACCOUNT_NUMBER: 'test-account',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['true', true],
    ['false', false],
    [undefined, false],
  ])(
    'sends queue_if_low_balance=%s',
    async (queueSetting, expectedQueueSetting) => {
      const post = vi.fn().mockResolvedValue({
        data: { id: 'pout_test', status: 'queued' },
      });
      vi.mocked(axios.create).mockReturnValue({ post } as AxiosInstance);
      const config = {
        get: vi.fn((key: string, fallback?: string) =>
          key === 'RAZORPAYX_QUEUE_IF_LOW_BALANCE'
            ? queueSetting
            : (configValues[key] ?? fallback),
        ),
        getOrThrow: vi.fn((key: string) => configValues[key]),
      };
      const service = new RazorpayXService(
        config as unknown as ConfigService,
      );

      await service.createPayout('fa_test', 500, 'claim-123', 'request-123');

      expect(post).toHaveBeenCalledWith(
        '/payouts',
        expect.objectContaining({
          mode: 'NEFT',
          queue_if_low_balance: expectedQueueSetting,
        }),
        { headers: { 'X-Payout-Idempotency': 'request-123' } },
      );
    },
  );

  it('fetches payout status by the RazorpayX payout ID', async () => {
    const payout = {
      id: 'pout_test',
      status: 'processed',
      reference_id: 'claim-123',
      amount: 50000,
    };
    const get = vi.fn().mockResolvedValue({ data: payout });
    vi.mocked(axios.create).mockReturnValue({ get } as AxiosInstance);
    const config = {
      get: vi.fn((key: string, fallback?: string) =>
        configValues[key] ?? fallback,
      ),
    };
    const service = new RazorpayXService(config as unknown as ConfigService);

    await expect(service.getPayout('pout_test')).resolves.toEqual(payout);
    expect(get).toHaveBeenCalledWith('/payouts/pout_test');
  });
});
