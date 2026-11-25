import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../invoices/invoice.entity';
import { Payment } from '../payments/payment.entity';
import { ItemsModule } from '../items/items.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, Payment]), ItemsModule],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
