import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Claim, ClaimBankAccount } from './claim.entities';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';
import { RazorpayXService } from './razorpayx.service';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [TypeOrmModule.forFeature([Claim, ClaimBankAccount]), WalletModule],
  controllers: [ClaimsController],
  providers: [ClaimsService, RazorpayXService],
})
export class ClaimsModule {}
