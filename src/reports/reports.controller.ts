import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OutstandingQueryDto, ReportsService, SalesReportQueryDto, TransactionsQueryDto } from './reports.service';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';
import { StockSummaryQueryDto } from '../items/items.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('reports', { readAlso: ['dashboard', 'billing', 'accounts', 'inventory'] })
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Sales or purchase report for a date range' })
  async sales(@Query() query: SalesReportQueryDto, @Request() req) {
    return { data: await this.reportsService.salesReport(query, req.user) };
  }

  @Get('outstanding')
  @ApiOperation({ summary: 'Unpaid invoices with aging buckets' })
  async outstanding(@Query() query: OutstandingQueryDto, @Request() req) {
    return { data: await this.reportsService.outstanding(query, req.user) };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Invoices, bills and payments in one date-ordered list' })
  async transactions(@Query() query: TransactionsQueryDto, @Request() req) {
    return { data: await this.reportsService.transactions(query, req.user) };
  }

  @Get('stock')
  @ApiOperation({ summary: 'Stock valuation and low-stock items' })
  async stock(@Query() query: StockSummaryQueryDto, @Request() req) {
    return { data: await this.reportsService.stock(req.user, query) };
  }
}
