import { Test, TestingModule } from '@nestjs/testing';
import { PayoutLedgerController } from './payout-ledger.controller';

describe('PayoutLedgerController', () => {
  let controller: PayoutLedgerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayoutLedgerController],
    }).compile();

    controller = module.get<PayoutLedgerController>(PayoutLedgerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
