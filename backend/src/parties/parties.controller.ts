import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePartyDto, PartiesService, PartyQueryDto, UpdatePartyDto } from './parties.service';

@ApiTags('parties')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('parties')
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer or supplier' })
  async create(@Body() body: CreatePartyDto, @Request() req) {
    return { data: await this.partiesService.create(body, req.user) };
  }

  @Get()
  @ApiOperation({ summary: 'List customers and suppliers' })
  async findAll(@Query() query: PartyQueryDto, @Request() req) {
    return this.partiesService.findAll(query, req.user);
  }

  @Get('accounts')
  @ApiOperation({ summary: 'Receivable/payable balance for every party' })
  async accounts(@Request() req) {
    return { data: await this.partiesService.getAccounts(req.user) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Party with invoices, payments and balance' })
  async findOne(@Param('id') id: string, @Request() req) {
    return { data: await this.partiesService.getLedger(id, req.user) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a party that has no invoices, payments or quotations' })
  async remove(@Param('id') id: string, @Request() req) {
    await this.partiesService.remove(id, req.user);
    return { data: { deleted: 1 } };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a party' })
  async update(@Param('id') id: string, @Body() body: UpdatePartyDto, @Request() req) {
    return { data: await this.partiesService.update(id, body, req.user) };
  }
}
