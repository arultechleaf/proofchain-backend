import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InvoiceType } from './invoice.entity';
import { CreateInvoiceDto, InvoiceQueryDto, InvoicesService } from './invoices.service';

@ApiTags('invoices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post('sales')
  @ApiOperation({ summary: 'Create a sales invoice and register its proof hash' })
  async createSale(@Body() body: CreateInvoiceDto, @Request() req) {
    return { data: await this.invoicesService.create(InvoiceType.SALE, body, req.user) };
  }

  @Post('purchases')
  @ApiOperation({ summary: 'Create a purchase bill and register its proof hash' })
  async createPurchase(@Body() body: CreateInvoiceDto, @Request() req) {
    return { data: await this.invoicesService.create(InvoiceType.PURCHASE, body, req.user) };
  }

  @Get('sales')
  @ApiOperation({ summary: 'List sales invoices' })
  async listSales(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoicesService.findAll({ ...query, type: InvoiceType.SALE }, req.user);
  }

  @Get('purchases')
  @ApiOperation({ summary: 'List purchase bills' })
  async listPurchases(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoicesService.findAll({ ...query, type: InvoiceType.PURCHASE }, req.user);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List sales and purchases together' })
  async list(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoicesService.findAll(query, req.user);
  }

  @Get('invoices/next-number')
  @ApiOperation({ summary: 'The invoice or bill number the next document will get' })
  async nextNumber(@Query('type') type: string, @Request() req) {
    if (type !== InvoiceType.SALE && type !== InvoiceType.PURCHASE) {
      throw new BadRequestException('type must be "sale" or "purchase"');
    }
    return { data: await this.invoicesService.previewNextNumber(type, req.user) };
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Invoice with lines and blockchain transaction' })
  async findOne(@Param('id') id: string, @Request() req) {
    return { data: await this.invoicesService.getDetail(id, req.user) };
  }

  @Post('invoices/:id/verify')
  @ApiOperation({ summary: 'Re-hash the invoice and compare with its blockchain proof' })
  async verify(@Param('id') id: string, @Request() req) {
    return { data: await this.invoicesService.verify(id, req.user) };
  }

  @Patch('invoices/:id/cancel')
  @ApiOperation({ summary: 'Cancel an unpaid invoice and restore stock' })
  async cancel(@Param('id') id: string, @Request() req) {
    return { data: await this.invoicesService.cancel(id, req.user) };
  }
}
