import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePaymentDto, PaymentQueryDto, PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a payment received or made' })
  async create(@Body() body: CreatePaymentDto, @Request() req) {
    return { data: await this.paymentsService.create(body, req.user) };
  }

  @Get()
  @ApiOperation({ summary: 'List payments' })
  async findAll(@Query() query: PaymentQueryDto, @Request() req) {
    return this.paymentsService.findAll(query, req.user);
  }
}
