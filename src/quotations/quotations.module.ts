import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quotation, QuotationLine } from './quotation.entities';
import { Party } from '../parties/party.entity';
import { Item } from '../items/item.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { InvoicesModule } from '../invoices/invoices.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Quotation, QuotationLine, Party, Item]), InvoicesModule, AuditModule],
  providers: [QuotationsService],
  controllers: [QuotationsController],
})
export class QuotationsModule {}
