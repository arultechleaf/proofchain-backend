import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { FeePlan } from '../fee-plan/fee-plan.entity';
import { PaymentOrder } from '../payment-orders/payment-orders.entity';
import { Payment } from './payment.entity';
import { AuditLog } from '../audit-logs/audit-log.entity';
import { ImplStaff } from '../impl-staff/impl-staff.entity';
import { Role } from '../roles/role.entity';
import { User } from '../users/user.entity';
// import { Customer } from '../customers/customer.entity';
 
@Module({
  imports: [
    TypeOrmModule.forFeature([FeePlan, PaymentOrder, Payment, AuditLog, ImplStaff, Role, User]),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}