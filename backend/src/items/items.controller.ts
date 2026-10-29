import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, Delete, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AdjustStockDto, CreateItemDto, ItemQueryDto, ItemsService, UpdateItemDto,
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

  @Screen('inventory', { readAlso: ['items', 'reports', 'dashboard'] })
  @Get('stock/summary')
  @ApiOperation({ summary: 'Inventory overview: all items with stock value and low-stock count' })
  async stockSummary(@Request() req) {
    return { data: await this.itemsService.stockSummary(req.user) };
  }

  @Screen('inventory', { readAlso: ['items', 'reports'] })
  @Get('stock/movements')
  @ApiOperation({ summary: 'Recent stock movements' })
  async movements(@Query('itemId', new ParseIntPipe({ optional: true })) itemId: number | undefined, @Request() req) {
    return { data: await this.itemsService.movements(req.user, itemId) };
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
  @ApiOperation({ summary: 'Add or remove stock' })
  async adjust(@Param('id', ParseIntPipe) id: number, @Body() body: AdjustStockDto, @Request() req) {
    return { data: await this.itemsService.adjustStock(id, body, req.user) };
  }
}
