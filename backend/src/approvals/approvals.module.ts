import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { Approval } from './approval.entity';
import { Delivery } from '../deliveries/delivery.entity';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';
import { BlockchainTransaction } from '../blockchain/blockchain-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Approval, Delivery, BlockchainTransaction]),
    BlockchainModule,
    AuditModule,
  ],
  providers: [ApprovalsService],
  controllers: [ApprovalsController],
})
export class ApprovalsModule {}
