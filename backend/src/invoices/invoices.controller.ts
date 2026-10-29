import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InvoiceType } from './invoice.entity';
import { CreateInvoiceDto, InvoiceQueryDto, InvoicesService } from './invoices.service';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('invoices')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Controller()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Screen('sales_create')
  @Post('sales')
  @ApiOperation({ summary: 'Create a sales invoice and register its proof hash' })
  async createSale(@Body() body: CreateInvoiceDto, @Request() req) {
    return { data: await this.invoicesService.create(InvoiceType.SALE, body, req.user) };
  }

  @Screen('purchases_create')
  @Post('purchases')
  @ApiOperation({ summary: 'Create a purchase bill and register its proof hash' })
  async createPurchase(@Body() body: CreateInvoiceDto, @Request() req) {
    return { data: await this.invoicesService.create(InvoiceType.PURCHASE, body, req.user) };
  }

  @Screen('sales', { readAlso: ['billing', 'dashboard', 'accounts', 'reports'] })
  @Get('sales')
  @ApiOperation({ summary: 'List sales invoices' })
  async listSales(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoicesService.findAll({ ...query, type: InvoiceType.SALE }, req.user);
  }

  @Screen('purchases', { readAlso: ['billing', 'dashboard', 'accounts', 'reports'] })
  @Get('purchases')
  @ApiOperation({ summary: 'List purchase bills' })
  async listPurchases(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoicesService.findAll({ ...query, type: InvoiceType.PURCHASE }, req.user);
  }

  @Screen('payments', { readAlso: ['sales', 'purchases', 'parties', 'billing', 'accounts', 'reports', 'dashboard'] })
  @Get('invoices')
  @ApiOperation({ summary: 'List sales and purchases together' })
  async list(@Query() query: InvoiceQueryDto, @Request() req) {
    return this.invoicesService.findAll(query, req.user);
  }

  @Screen('sales_create', { readAlso: ['purchases_create'] })
  @Get('invoices/next-number')
  @ApiOperation({ summary: 'The invoice or bill number the next document will get' })
  async nextNumber(@Query('type') type: string, @Request() req) {
    if (type !== InvoiceType.SALE && type !== InvoiceType.PURCHASE) {
      throw new BadRequestException('type must be "sale" or "purchase"');
    }
    return { data: await this.invoicesService.previewNextNumber(type, req.user) };
  }

  @Screen('sales', { readAlso: ['purchases', 'payments', 'parties', 'billing', 'accounts'] })
  @Get('invoices/:id')
  @ApiOperation({ summary: 'Invoice with lines and blockchain transaction' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.invoicesService.getDetail(id, req.user) };
  }

  @Screen('verification', { writeAlso: ['sales', 'purchases'] })
  @Post('invoices/:id/verify')
  @ApiOperation({ summary: 'Re-hash the invoice and compare with its blockchain proof' })
  async verify(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.invoicesService.verify(id, req.user) };
  }

  @Screen('sales', { writeAlso: ['purchases'] })
  @Patch('invoices/:id/cancel')
  @ApiOperation({ summary: 'Cancel an unpaid invoice and restore stock' })
  async cancel(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.invoicesService.cancel(id, req.user) };
  }
}
