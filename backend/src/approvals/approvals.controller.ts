import { Controller, Get, Post, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApprovalsService, CreateApprovalDto } from './approvals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('approvals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('deliveries/:id/approvals')
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @ApiOperation({ summary: 'Approve or reject a delivery (Company B only)' })
  async create(
    @Param('id') deliveryId: string,
    @Body() dto: CreateApprovalDto,
    @Request() req,
  ) {
    const approval = await this.approvalsService.createApproval(
      deliveryId,
      dto,
      req.user.id,
      req.user.role,
      req.user.companyId,
    );
    return { data: approval };
  }

  @Get()
  @ApiOperation({ summary: 'Get approval history for a delivery' })
  async findAll(@Param('id') deliveryId: string) {
    const approvals = await this.approvalsService.getApprovalsByDelivery(deliveryId);
    return { data: approvals };
  }
}
