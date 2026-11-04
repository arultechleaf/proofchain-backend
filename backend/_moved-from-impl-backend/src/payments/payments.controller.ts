import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { PaymentsService } from './payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { CurrentUserId } from '../common/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /api/payments/create-order
  @Post('create-order')
  createOrder(@Body() dto: CreateOrderDto, @CurrentUserId() meUserId: number) {
    return this.paymentsService.createOrder(dto, meUserId);
  }

  // POST /api/payments/verify
  @Post('verify')
  @HttpCode(200)
  verifyPayment(@Body() body: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(body);
  }

  // POST /api/payments/webhook
  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException('Raw body missing');
    }
    return this.paymentsService.handleWebhook(req.rawBody, signature, req.body);
  }
}