import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('dashboard')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get dashboard summary statistics' })
  async getSummary(@Request() req) {
    const data = await this.dashboardService.getSummary(
      req.user.role,
      req.user.companyId,
    );
    return { data };
  }

  @Get('activity')
  @ApiOperation({ summary: 'Get dashboard activity data for charts' })
  async getActivity(@Request() req) {
    const data = await this.dashboardService.getActivity();
    return { data };
  }
}
