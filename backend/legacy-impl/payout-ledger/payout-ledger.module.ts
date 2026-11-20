
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayoutLedger } from './payout-ledger.entity';
import { PayoutLedgerService } from './payout-ledger.service';
import { PayoutLedgerController } from './payout-ledger.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PayoutLedger])],
  controllers: [PayoutLedgerController],
  providers: [PayoutLedgerService],
  exports: [PayoutLedgerService],
})
export class PayoutLedgerModule {}
