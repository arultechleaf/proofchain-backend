import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './payment.entity';
import { RazorpayOrder } from './razorpay-order.entity';
import { Invoice } from '../invoices/invoice.entity';
import { Party } from '../parties/party.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { RazorpayService } from './razorpay.service';
import { RazorpayController } from './razorpay.controller';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, RazorpayOrder, Invoice, Party]), AuditModule, NotificationsModule],
  providers: [PaymentsService, RazorpayService],
  controllers: [PaymentsController, RazorpayController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
