import {
  Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AdjustStockDto, CreateItemDto, ItemQueryDto, ItemsService, UpdateItemDto,
} from './items.service';

@ApiTags('items')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
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

  @Get('stock/summary')
  @ApiOperation({ summary: 'Inventory overview: all items with stock value and low-stock count' })
  async stockSummary(@Request() req) {
    return { data: await this.itemsService.stockSummary(req.user) };
  }

  @Get('stock/movements')
  @ApiOperation({ summary: 'Recent stock movements' })
  async movements(@Query('itemId') itemId: string | undefined, @Request() req) {
    return { data: await this.itemsService.movements(req.user, itemId) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an item' })
  async findOne(@Param('id') id: string, @Request() req) {
    return { data: await this.itemsService.findById(id, req.user) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an item' })
  async update(@Param('id') id: string, @Body() body: UpdateItemDto, @Request() req) {
    return { data: await this.itemsService.update(id, body, req.user) };
  }

  @Post(':id/adjust')
  @ApiOperation({ summary: 'Add or remove stock' })
  async adjust(@Param('id') id: string, @Body() body: AdjustStockDto, @Request() req) {
    return { data: await this.itemsService.adjustStock(id, body, req.user) };
  }
}
