import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './invoice.entity';
import { InvoiceLine } from './invoice-line.entity';
import { Party } from '../parties/party.entity';
import { Item } from '../items/item.entity';
import { BlockchainTransaction } from '../blockchain/blockchain-transaction.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { ItemsModule } from '../items/items.module';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceLine, Party, Item, BlockchainTransaction]),
    ItemsModule,
    BlockchainModule,
    AuditModule,
  ],
  providers: [InvoicesService],
  controllers: [InvoicesController],
  exports: [InvoicesService],
})
export class InvoicesModule {}
