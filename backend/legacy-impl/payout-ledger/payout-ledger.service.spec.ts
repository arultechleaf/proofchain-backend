import { Test, TestingModule } from '@nestjs/testing';
import { PayoutLedgerService } from './payout-ledger.service';

describe('PayoutLedgerService', () => {
  let service: PayoutLedgerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PayoutLedgerService],
    }).compile();

    service = module.get<PayoutLedgerService>(PayoutLedgerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
