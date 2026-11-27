import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SUBSCRIPTION_ENTITIES } from './subscription.entities';
import { User } from '../users/user.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlansController, SubscriptionsController } from './subscriptions.controller';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([...SUBSCRIPTION_ENTITIES, User]), PaymentsModule, NotificationsModule, AuditModule],
  providers: [SubscriptionsService],
  controllers: [SubscriptionPlansController, SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
