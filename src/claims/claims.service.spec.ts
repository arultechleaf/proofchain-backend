import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { vi } from 'vitest';
import { WalletService } from '../wallet/wallet.service';
import { Claim, ClaimBankAccount, ClaimStatus } from './claim.entities';
import { ClaimsService } from './claims.service';
import { RazorpayXService } from './razorpayx.service';

describe('ClaimsService payout reconciliation', () => {
  it('returns claim history without calling RazorpayX for each processing payout', async () => {
    const claim: Partial<Claim> = {
      id: 7,
      userId: 12,
      walletId: 3,
      amount: '500.00',
      status: ClaimStatus.PROCESSING,
      razorpayPayoutId: 'pout_test',
      referenceId: 'CLM-123',
    };
    const claims = {
      findAndCount: vi.fn().mockResolvedValue([[claim], 1]),
    };
    const razorpayX = {
      isConfigured: vi.fn().mockReturnValue(true),
      getPayout: vi.fn(),
    };
    const service = new ClaimsService(
      {} as DataSource,
      {} as ConfigService,
      razorpayX as unknown as RazorpayXService,
      {} as WalletService,
      claims as unknown as Repository<Claim>,
      {} as Repository<ClaimBankAccount>,
    );

    const result = await service.list(12, { page: 1, limit: 20 });

    expect(result.rows[0].status).toBe(ClaimStatus.PROCESSING);
    expect(razorpayX.getPayout).not.toHaveBeenCalled();
  });

  it('still updates a payout immediately when manually refreshed', async () => {
    const claim: Partial<Claim> = {
      id: 8,
      userId: 12,
      walletId: 3,
      amount: '500.00',
      status: ClaimStatus.PROCESSING,
      razorpayPayoutId: 'pout_test',
      referenceId: 'CLM-456',
      utr: null,
    };
    const manager = {
      findOne: vi.fn().mockResolvedValue(claim),
      save: vi.fn().mockImplementation(async (entity) => entity),
    };
    const claims = {
      findOne: vi.fn().mockResolvedValue(claim),
      findOneByOrFail: vi.fn().mockResolvedValue(claim),
    };
    const razorpayX = {
      isConfigured: vi.fn().mockReturnValue(true),
      assertConfigured: vi.fn(),
      getPayout: vi.fn().mockResolvedValue({
        id: 'pout_test',
        reference_id: 'CLM-456',
        amount: 50000,
        status: 'processed',
        utr: 'UTR123',
      }),
    };
    const service = new ClaimsService(
      {
        transaction: vi.fn((work) => work(manager)),
      } as unknown as DataSource,
      {} as ConfigService,
      razorpayX as unknown as RazorpayXService,
      {} as WalletService,
      claims as unknown as Repository<Claim>,
      {} as Repository<ClaimBankAccount>,
    );

    const result = await service.refreshStatus(12, 8);

    expect(razorpayX.getPayout).toHaveBeenCalledWith('pout_test');
    expect(result.status).toBe(ClaimStatus.COMPLETED);
    expect(result.utr).toBe('UTR123');
  });
});
