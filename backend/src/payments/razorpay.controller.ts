import {
  Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRazorpayOrderDto, RazorpayService, VerifyRazorpayPaymentDto } from './razorpay.service';

@ApiTags('payments')
@Controller('payments/razorpay')
export class RazorpayController {
  constructor(private readonly razorpay: RazorpayService) {}

  @Get('config')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Whether online payments are set up, and the public key id for Checkout' })
  config() {
    return { data: this.razorpay.getConfig() };
  }

  @Post('order')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a Razorpay order for a sales invoice' })
  async createOrder(@Body() body: CreateRazorpayOrderDto, @Req() req) {
    return { data: await this.razorpay.createOrder(body, req.user) };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Verify the Checkout result and record the payment' })
  async verify(@Body() body: VerifyRazorpayPaymentDto, @Req() req) {
    return { data: await this.razorpay.verifyPayment(body, req.user) };
  }

  /**
   * Called by Razorpay, not by a logged-in user, so there is no JWT: the HMAC signature over the
   * raw request body is what authenticates it. Requires `rawBody: true` in main.ts.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay webhook (signature-verified)' })
  webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-razorpay-signature') signature?: string) {
    return this.razorpay.handleWebhook(req.rawBody, signature);
  }
}
