import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet, WalletTransaction } from './wallet.entities';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { RolesGuard } from '../auth/roles.guard';
import { AuditModule } from '../audit/audit.module';
import { AuditLog } from '../audit/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, WalletTransaction, AuditLog]),
    AuditModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, RolesGuard],
  exports: [WalletService],
})
export class WalletModule {}
