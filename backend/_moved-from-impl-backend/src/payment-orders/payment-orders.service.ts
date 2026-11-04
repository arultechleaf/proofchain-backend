import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentOrder } from './payment-orders.entity';
import { FeePlan } from '../fee-plan/fee-plan.entity';

@Injectable()
export class PaymentOrdersService {
  constructor(
    @InjectRepository(PaymentOrder)
    private readonly paymentOrderRepository: Repository<PaymentOrder>,
    @InjectRepository(FeePlan)
    private readonly feePlanRepository: Repository<FeePlan>,
  ) {}

async create(data: {
  payer_type: 'STAFF' | 'CUSTOMER';
  payer_id: string;
  fee_plan_id: number;
  receipt_no: string;
  razorpay_order_id?: string | null;
  created_by?: number | null;
}): Promise<PaymentOrder> {
  const feePlan = await this.feePlanRepository.findOne({
    where: {
      id: data.fee_plan_id,
      plan_for: data.payer_type,
      status: 1,
    },
  });

  if (!feePlan) {
    throw new BadRequestException(
      'Active fee plan not found for the specified payer type',
    );
  }

  const existing = await this.paymentOrderRepository.findOne({
    where: { receipt_no: data.receipt_no },
  });

  if (existing) {
    throw new ConflictException('Receipt number already exists');
  }

  const totalAmount = Number(feePlan.total_amount);

  const paymentOrder = this.paymentOrderRepository.create({
    payer_type: data.payer_type,
    payer_id: data.payer_id,
    fee_plan_id: data.fee_plan_id,
    base_amount: String(feePlan.base_amount),
    gst_amount: String(feePlan.gst_amount),
    total_amount: String(totalAmount),
    amount_paise: String(Math.round(totalAmount * 100)),
    receipt_no: data.receipt_no,
    razorpay_order_id: data.razorpay_order_id ?? null,
    status: 'CREATED',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    created_by:
      data.created_by != null ? Number(data.created_by) : null,
  });

  return this.paymentOrderRepository.save(paymentOrder);
}


  async findAll(): Promise<PaymentOrder[]> {
    return this.paymentOrderRepository.find({
      order: { payment_order_id: 'DESC' },
    });
  }
}