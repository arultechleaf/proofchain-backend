import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { Delivery } from '../deliveries/delivery.entity';
import { BlockchainTransaction } from '../blockchain/blockchain-transaction.entity';
import { Approval } from '../approvals/approval.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Delivery, BlockchainTransaction, Approval])],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
