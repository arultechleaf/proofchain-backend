import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateExpenseDto, ExpenseQueryDto, ExpensesService, UpdateExpenseDto } from './expenses.service';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('expenses')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Post()
  @ApiOperation({ summary: 'Record an expense' })
  async create(@Body() body: CreateExpenseDto, @Request() req) {
    return { data: await this.service.create(body, req.user) };
  }

  @Get()
  @ApiOperation({ summary: 'List expenses' })
  findAll(@Query() query: ExpenseQueryDto, @Request() req) {
    return this.service.findAll(query, req.user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Total and per-category spend for a date range' })
  async summary(@Query() query: ExpenseQueryDto, @Request() req) {
    return { data: await this.service.summary(query, req.user) };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Categories already used (for suggestions)' })
  async categories(@Request() req) {
    return { data: await this.service.categories(req.user) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit an expense' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateExpenseDto, @Request() req) {
    return { data: await this.service.update(id, body, req.user) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an expense' })
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    await this.service.remove(id, req.user);
    return { data: { deleted: 1 } };
  }
}
