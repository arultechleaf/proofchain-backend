import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  DeliveriesService,
  CreateDeliveryDto,
  DeliveryQueryDto,
} from './deliveries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('deliveries')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('deliveries', { readAlso: ['approvals', 'verification', 'dashboard'] })
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Screen('deliveries_create')
  @Post()
  @ApiOperation({ summary: 'Create a new delivery with blockchain proof registration' })
  async create(@Body() body: CreateDeliveryDto, @Request() req) {
    const delivery = await this.deliveriesService.create(
      body,
      req.user.id,
      req.user.companyId,
      req.user.role,
    );
    return { data: delivery };
  }

  @Get()
  @ApiOperation({ summary: 'List deliveries with pagination and filtering' })
  async findAll(@Query() query: DeliveryQueryDto, @Request() req) {
    return this.deliveriesService.findAll(
      query,
      req.user.role,
      req.user.companyId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get delivery by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const delivery = await this.deliveriesService.findById(id);
    return { data: delivery };
  }

  @Get(':id/proof')
  @ApiOperation({ summary: 'Get proof and blockchain transaction details for a delivery' })
  async getProof(@Param('id', ParseIntPipe) id: number) {
    const proof = await this.deliveriesService.getProofDetails(id);
    return { data: proof };
  }
}
