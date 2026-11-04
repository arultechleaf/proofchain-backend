import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentOrder } from './payment-orders.entity';
import { FeePlan } from '../fee-plan/fee-plan.entity';
import { PaymentOrdersController } from './payment-orders.controller';
import { PaymentOrdersService } from './payment-orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentOrder, FeePlan])],
  controllers: [PaymentOrdersController],
  providers: [PaymentOrdersService],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}