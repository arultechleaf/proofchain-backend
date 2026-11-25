import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, Delete, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateQuotationDto, QuotationQueryDto, QuotationsService, UpdateQuotationStatusDto,
} from './quotations.service';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('quotations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('quotations', { readAlso: ['sales_create'] })
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a quotation / estimate' })
  async create(@Body() body: CreateQuotationDto, @Request() req) {
    return { data: await this.service.create(body, req.user) };
  }

  @Get()
  @ApiOperation({ summary: 'List quotations' })
  findAll(@Query() query: QuotationQueryDto, @Request() req) {
    return this.service.findAll(query, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One quotation with its lines' })
  async findOne(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.service.findById(id, req.user) };
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Mark a quotation draft, sent, accepted or rejected' })
  async setStatus(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateQuotationStatusDto, @Request() req) {
    return { data: await this.service.setStatus(id, body.status, req.user) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a quotation that was not converted' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    await this.service.remove(id, req.user);
    return { data: { deleted: 1 } };
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert a quotation into a sales invoice' })
  async convert(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.service.convert(id, req.user) };
  }
}
