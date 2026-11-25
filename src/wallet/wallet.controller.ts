import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreditWalletDto } from './wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Post('users/:userId/credits')
  async credit(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: CreditWalletDto,
    @Req() req,
  ) {
    if (userId === req.user.id) {
      throw new BadRequestException(
        'An admin cannot approve a wallet credit to their own account',
      );
    }
    return {
      data: await this.wallets.creditApproved(userId, req.user.id, body),
    };
  }
}
