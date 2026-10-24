import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Party } from './party.entity';
import { Invoice } from '../invoices/invoice.entity';
import { Payment } from '../payments/payment.entity';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Party, Invoice, Payment]), AuditModule],
  providers: [PartiesService],
  controllers: [PartiesController],
  exports: [PartiesService],
})
export class PartiesModule {}
