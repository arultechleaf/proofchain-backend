import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';
import { Delivery } from './delivery.entity';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlockchainTransaction } from '../blockchain/blockchain-transaction.entity';
import { ProofRecord } from '../proofs/proof-record.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, BlockchainTransaction, ProofRecord]),
    BlockchainModule,
    AuditModule,
    NotificationsModule,
  ],
  providers: [DeliveriesService],
  controllers: [DeliveriesController],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
