import { Test, TestingModule } from '@nestjs/testing';
import { PaymentOrdersService } from './payment-orders.service';

describe('PaymentOrdersService', () => {
  let service: PaymentOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentOrdersService],
    }).compile();

    service = module.get<PaymentOrdersService>(PaymentOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
