
import {
  Controller,
  Post,
  Get,
  Body,
} from '@nestjs/common';
import { PayoutLedgerService } from './payout-ledger.service';

@Controller('payout-ledger')
export class PayoutLedgerController {
  constructor(
    private readonly payoutLedgerService: PayoutLedgerService,
  ) {}

  // POST: Create a payout ledger record
  @Post()
  async create(
    @Body()
    body: {
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
    },
  ) {
    return this.payoutLedgerService.create(body);
  }

  // GET: Retrieve all payout ledger records
  @Get()
  async findAll() {
    return this.payoutLedgerService.findAll();
  }
}
