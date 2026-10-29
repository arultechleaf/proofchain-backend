import { Controller, Post, Get, Param, UseGuards, Request, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('verification')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('verification', { readAlso: ['deliveries'] })
@Controller('deliveries/:id/verify')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post()
  @ApiOperation({ summary: 'Verify a delivery proof hash against stored record and blockchain' })
  async verify(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const result = await this.verificationService.verifyDelivery(id, req.user.id);
    return { data: result };
  }
}
