
import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayoutLedger } from './payout-ledger.entity';

@Injectable()
export class PayoutLedgerService {
  constructor(
    @InjectRepository(PayoutLedger)
    private readonly payoutLedgerRepository: Repository<PayoutLedger>,
  ) {}

  async create(data: {
    payment_id: string;
    earner_user_id: number;
    earner_role_id: number;
    own_amount?: string;
    rolled_up_amount?: string;
    amount: string;
    rolled_up_roles?: string | null;
    status?: 'ON_HOLD' | 'CREDITED' | 'CANCELLED';
    release_at: string;
    credited_at?: string | null;
  }): Promise<PayoutLedger> {
    if (Number(data.amount) < 0) {
      throw new BadRequestException(
        'Amount cannot be negative',
      );
    }

    const payoutLedger = this.payoutLedgerRepository.create({
      payment_id: data.payment_id,
      earner_user_id: data.earner_user_id,
      earner_role_id: data.earner_role_id,
      own_amount: data.own_amount ?? '0.00',
      rolled_up_amount: data.rolled_up_amount ?? '0.00',
      amount: data.amount,
      rolled_up_roles: data.rolled_up_roles ?? null,
      status: data.status ?? 'ON_HOLD',
      release_at: new Date(data.release_at),
      credited_at: data.credited_at
        ? new Date(data.credited_at)
        : null,
    });

    return this.payoutLedgerRepository.save(payoutLedger);
  }

  async findAll(): Promise<PayoutLedger[]> {
    return this.payoutLedgerRepository.find({
      order: { payout_ledger_id: 'DESC' },
    });
  }
}
