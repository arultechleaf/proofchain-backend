import { Controller, Post, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('verification')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('deliveries/:id/verify')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post()
  @ApiOperation({ summary: 'Verify a delivery proof hash against stored record and blockchain' })
  async verify(@Param('id') id: string, @Request() req) {
    const result = await this.verificationService.verifyDelivery(id, req.user.id);
    return { data: result };
  }
}
