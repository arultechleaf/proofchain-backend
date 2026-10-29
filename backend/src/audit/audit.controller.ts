import { Controller, Get, Query, Res, UseGuards, Request } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('audit')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  @ApiOperation({ summary: 'Get audit logs' })
  async getLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.auditService.findAll({
      page: +page,
      limit: +limit,
      resourceType,
    });
  }

  @Get('export')
  @ApiOperation({ summary: 'Export audit logs to CSV' })
  async exportCsv(@Res() res: Response) {
    const csv = await this.auditService.exportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="proofchain-audit-${Date.now()}.csv"`,
    );
    res.send(csv);
  }
}
