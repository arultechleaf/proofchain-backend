import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount, BankTransaction } from './cash-bank.entities';
import { CashBankService } from './cash-bank.service';
import { CashBankController } from './cash-bank.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([BankAccount, BankTransaction]), AuditModule],
  providers: [CashBankService],
  controllers: [CashBankController],
  exports: [CashBankService],
})
export class CashBankModule {}
