import { Body, Controller, Get, Header, Param, Patch, Post, Query, Request, UseGuards, Delete, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AdjustStockDto, CreateItemDto, ItemQueryDto, ItemsService, MovementQueryDto, StockEntryDto, StockReturnDto,
  StockSummaryQueryDto, TransferStockDto, UpdateItemDto,
} from './items.service';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('items')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('items', { readAlso: ['sales', 'sales_create', 'purchases', 'purchases_create', 'quotations', 'inventory', 'payments', 'reports'] })
@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an item' })
  async create(@Body() body: CreateItemDto, @Request() req) {
    return { data: await this.itemsService.create(body, req.user) };
  }

  @Get()
  @ApiOperation({ summary: 'List items' })
  async findAll(@Query() query: ItemQueryDto, @Request() req) {
    return this.itemsService.findAll(query, req.user);
  }

  @Screen('inventory', { readAlso: ['items', 'reports', 'dashboard', 'company_inventory', 'stock_entry'] })
  @Get('stock/summary')
  @ApiOperation({ summary: 'Inventory overview: items with stock value and low-stock count, and the totals per branch' })
  async stockSummary(@Query() query: StockSummaryQueryDto, @Request() req) {
    return { data: await this.itemsService.stockSummary(req.user, query) };
  }

  @Screen('inventory', { readAlso: ['items', 'reports', 'company_inventory'] })
  @Get('stock/movements')
  @ApiOperation({ summary: 'Stock history, filterable by item, branch, reason and dates' })
  async movements(@Query() query: MovementQueryDto, @Request() req) {
    return this.itemsService.movements(req.user, query);
  }

  @Screen('inventory', { readAlso: ['items', 'reports', 'company_inventory'] })
  @Get('stock/movements/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="stock-history.csv"')
  @ApiOperation({ summary: 'The same stock history as a CSV file' })
  async movementsCsv(@Query() query: MovementQueryDto, @Request() req) {
    return this.itemsService.movementsCsv(req.user, query);
  }

  @Screen('stock_entry', { writeAlso: ['inventory'] })
  @Post('stock/transfer')
  @ApiOperation({ summary: 'Move stock of one item from one branch to another' })
  async transfer(@Body() body: TransferStockDto, @Request() req) {
    return { data: await this.itemsService.transfer(body, req.user) };
  }

  @Screen('stock_entry', { writeAlso: ['inventory'] })
  @Post('stock/returns')
  @ApiOperation({ summary: 'Record a sale return (stock up) or a purchase return (stock down)' })
  async returns(@Body() body: StockReturnDto, @Request() req) {
    return { data: await this.itemsService.returnStock(body, req.user) };
  }

  @Screen('stock_entry', { writeAlso: ['inventory'] })
  @Post('stock/entry')
  @ApiOperation({ summary: 'Add, receive or correct the stock of several items at one branch' })
  async entry(@Body() body: StockEntryDto, @Request() req) {
    return { data: await this.itemsService.stockEntry(body, req.user) };
  }

  @Screen('inventory', { readAlso: ['items', 'stock_entry', 'company_inventory'] })
  @Get(':id/branches')
  @ApiOperation({ summary: 'How much of an item each branch holds' })
  async branches(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.itemsService.stockByBranch(id, req.user) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an item' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.itemsService.findById(id, req.user) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an item that is not on any invoice or quotation' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    await this.itemsService.remove(id, req.user);
    return { data: { deleted: 1 } };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an item' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateItemDto, @Request() req) {
    return { data: await this.itemsService.update(id, body, req.user) };
  }

  @Screen('inventory', { writeAlso: ['items'] })
  @Post(':id/adjust')
  @ApiOperation({ summary: 'Add or remove stock at a branch' })
  async adjust(@Param('id', ParseIntPipe) id: number, @Body() body: AdjustStockDto, @Request() req) {
    return { data: await this.itemsService.adjustStock(id, body, req.user) };
  }
}
