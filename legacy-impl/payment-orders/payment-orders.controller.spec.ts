import { Test, TestingModule } from '@nestjs/testing';
import { PaymentOrdersController } from './payment-orders.controller';

describe('PaymentOrdersController', () => {
  let controller: PaymentOrdersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentOrdersController],
    }).compile();

    controller = module.get<PaymentOrdersController>(PaymentOrdersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
