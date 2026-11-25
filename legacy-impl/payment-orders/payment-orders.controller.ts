import { Controller, Post, Get, Body } from '@nestjs/common';
import { PaymentOrdersService } from './payment-orders.service';

@Controller('payment-orders')
export class PaymentOrdersController {
  constructor(private readonly paymentOrdersService: PaymentOrdersService) {}

  @Post()
  async create(
    @Body()
    body: {
      payer_type: 'STAFF' | 'CUSTOMER';
      payer_id: string;
      fee_plan_id: number;
      receipt_no: string;
      created_by?: number | null;
    },
  ) {
    return this.paymentOrdersService.create(body);
  }

  @Get()
  async findAll() {
    return this.paymentOrdersService.findAll();
  }
}