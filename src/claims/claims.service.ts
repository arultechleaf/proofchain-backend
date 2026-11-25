import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Claim, ClaimBankAccount, ClaimStatus } from './claim.entities';
import { ClaimQueryDto, CreateClaimDto } from './claims.dto';
import {
  RazorpayEntity,
  RazorpayXRequestError,
  RazorpayXService,
} from './razorpayx.service';
import { Wallet, WalletTransaction } from '../wallet/wallet.entities';
import { WalletService } from '../wallet/wallet.service';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly razorpayX: RazorpayXService,
    private readonly walletService: WalletService,
    @InjectRepository(Claim) private readonly claims: Repository<Claim>,
    @InjectRepository(ClaimBankAccount)
    private readonly banks: Repository<ClaimBankAccount>,
  ) {}

  private get minimum() {
    return Number(this.config.get<string>('MIN_CLAIM_AMOUNT', '100'));
  }

  private key() {
    const key = this.config.get<string>('CLAIM_BANK_ENCRYPTION_KEY', '');
    if (!/^[0-9a-f]{64}$/i.test(key)) {
      throw new BadRequestException(
        'Bank-detail encryption is not configured on the backend',
      );
    }
    return Buffer.from(key, 'hex');
  }

  private encrypt(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${data.toString('base64')}`;
  }

  async create(userId: number, dto: CreateClaimDto) {
    const existing = await this.claims.findOne({
      where: { userId, requestId: dto.requestId },
    });
    if (existing) return this.presentClaim(existing);

    this.razorpayX.assertConfigured();

    const amount = Math.round(dto.amount * 100) / 100;
    if (amount < this.minimum) {
      throw new BadRequestException(`Minimum claim amount is ₹${this.minimum}`);
    }

    const referenceId = `CLM-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const idempotencyKey = randomUUID();
    const accountDetails = {
      accountHolderName: dto.accountHolderName.trim(),
      accountNumber: dto.accountNumber,
      ifsc: dto.ifsc.toUpperCase(),
    };

    let claim: Claim;
    try {
      claim = await this.db.transaction(async (manager) => {
        await this.walletService.syncIncomingPayments(userId, manager);
        const wallet = await this.walletService.ensure(manager, userId);

        const available = Number(wallet.balance);
        if (available < amount) {
          throw new BadRequestException('Insufficient wallet balance');
        }

        const bank = await manager.findOne(ClaimBankAccount, {
          where: { userId },
        });
        const encryptedDetails = this.encrypt(accountDetails);
        await manager.save(
          ClaimBankAccount,
          bank
            ? {
                ...bank,
                encryptedDetails,
                lastFour: accountDetails.accountNumber.slice(-4),
              }
            : manager.create(ClaimBankAccount, {
                userId,
                encryptedDetails,
                lastFour: accountDetails.accountNumber.slice(-4),
              }),
        );

        wallet.balance = available.toFixed(2);
        await this.walletService.debitClaim(
          manager,
          wallet,
          amount,
          referenceId,
        );

        return manager.save(
          Claim,
          manager.create(Claim, {
            userId,
            walletId: wallet.id,
            requestId: dto.requestId,
            amount: amount.toFixed(2),
            status: ClaimStatus.PROCESSING,
            referenceId,
            payoutIdempotencyKey: idempotencyKey,
            bankAccountLastFour: accountDetails.accountNumber.slice(-4),
          }),
        );
      });
    } catch (error) {
      const duplicateRequest = await this.claims.findOne({
        where: { userId, requestId: dto.requestId },
      });
      if (duplicateRequest) return this.presentClaim(duplicateRequest);
      throw error;
    }

    await this.submitPayout(claim, accountDetails);
    return this.presentClaim(
      await this.claims.findOneByOrFail({ id: claim.id }),
    );
  }

  async retry(userId: number, claimId: number) {
    const claim = await this.claims.findOne({
      where: { id: claimId, userId },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (
      claim.status !== ClaimStatus.PROCESSING ||
      !claim.razorpayFundAccountId ||
      claim.razorpayPayoutId
    ) {
      throw new BadRequestException(
        'This payout is not eligible for a safe retry',
      );
    }

    this.razorpayX.assertConfigured();
    await this.sendPayout(claim);
    return this.presentClaim(
      await this.claims.findOneByOrFail({ id: claim.id }),
    );
  }

  async refreshStatus(userId: number, claimId: number) {
    const claim = await this.claims.findOne({
      where: { id: claimId, userId },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== ClaimStatus.PROCESSING) {
      return this.presentClaim(claim);
    }
    if (!claim.razorpayPayoutId) {
      throw new BadRequestException(
        'RazorpayX has not returned a payout ID for this claim yet',
      );
    }
    this.razorpayX.assertConfigured();
    return this.presentClaim(await this.refreshPayoutStatus(claim));
  }

  async list(userId: number, query: ClaimQueryDto) {
    const limit = Math.min(query.limit, 100);
    const [rows, total] = await this.claims.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * limit,
      take: limit,
    });
    return {
      rows: rows.map((claim) => this.presentClaim(claim)),
      total,
      page: query.page,
      limit,
    };
  }

  async wallet(userId: number) {
    await this.walletService.syncIncomingPayments(userId);
    return {
      balance: await this.availableBalance(userId),
      minimumClaimAmount: this.minimum,
    };
  }

  async webhook(raw: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>('RAZORPAYX_WEBHOOK_SECRET', '');
    if (!secret || !raw || !signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);
    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = JSON.parse(raw.toString('utf8'));
    const payout = event.payload?.payout?.entity;
    if (!payout?.id) return { status: 'ignored' };

    const claim = await this.claims.findOne({
      where: [
        { razorpayPayoutId: payout.id },
        { referenceId: payout.reference_id },
      ],
    });
    if (!claim) return { status: 'ignored' };

    const status =
      payout.status ??
      (event.event === 'payout.processed'
        ? 'processed'
        : event.event === 'payout.failed'
          ? 'failed'
          : event.event === 'payout.reversed'
            ? 'reversed'
            : undefined);
    if (!status) return { status: 'ignored' };

    return {
      status: await this.applyPayoutStatus(claim.id, {
        ...payout,
        status,
      }),
    };
  }

  private async refreshPayoutStatus(claim: Claim): Promise<Claim> {
    try {
      const payout = await this.razorpayX.getPayout(claim.razorpayPayoutId!);
      if (
        payout.id !== claim.razorpayPayoutId ||
        (payout.reference_id !== undefined &&
          payout.reference_id !== claim.referenceId) ||
        (payout.amount !== undefined &&
          payout.amount !== Math.round(Number(claim.amount) * 100))
      ) {
        const message = `RazorpayX payout ${claim.razorpayPayoutId} did not match claim ${claim.id}; status was not updated`;
        this.logger.error(message);
        throw new BadRequestException(
          'RazorpayX payout details did not match this claim',
        );
      }

      await this.applyPayoutStatus(claim.id, payout);
      return await this.claims.findOneByOrFail({ id: claim.id });
    } catch (error) {
      if (error instanceof RazorpayXRequestError) {
        this.logger.warn(
          `Unable to refresh RazorpayX payout ${claim.razorpayPayoutId}: ${error.message}`,
        );
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private async applyPayoutStatus(
    claimId: number,
    payout: RazorpayEntity,
  ): Promise<'completed' | 'refunded' | 'processing' | 'ignored'> {
    const status = payout.status?.toLowerCase() ?? 'processing';

    if (
      status === 'failed' ||
      status === 'reversed' ||
      status === 'cancelled' ||
      status === 'rejected'
    ) {
      const refunded = await this.failAndRefund(
        claimId,
        payout.status_details?.description ||
          `RazorpayX payout ${status}`,
        payout.id,
        status === 'reversed',
      );
      return refunded ? 'refunded' : 'ignored';
    }

    if (status === 'processed') {
      const completed = await this.db.transaction(async (manager) => {
        const claim = await manager.findOne(Claim, {
          where: { id: claimId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!claim || claim.status === ClaimStatus.FAILED) return false;
        claim.razorpayPayoutId = payout.id;
        claim.status = ClaimStatus.COMPLETED;
        claim.utr = payout.utr ?? null;
        await manager.save(claim);
        return true;
      });
      return completed ? 'completed' : 'ignored';
    }

    const updated = await this.db.transaction(async (manager) => {
      const claim = await manager.findOne(Claim, {
        where: { id: claimId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !claim ||
        claim.status === ClaimStatus.COMPLETED ||
        claim.status === ClaimStatus.FAILED
      ) {
        return false;
      }
      claim.razorpayPayoutId = payout.id;
      claim.status = ClaimStatus.PROCESSING;
      await manager.save(claim);
      return true;
    });
    return updated ? 'processing' : 'ignored';
  }

  private async submitPayout(
    claim: Claim,
    accountDetails: Pick<
      CreateClaimDto,
      'accountHolderName' | 'accountNumber' | 'ifsc'
    >,
  ): Promise<void> {
    try {
      const contact = await this.razorpayX.createContact(
        accountDetails.accountHolderName,
        `${claim.referenceId}-CONTACT`,
      );
      await this.claims.update(claim.id, {
        razorpayContactId: contact.id,
      });

      const fundAccount = await this.razorpayX.createFundAccount(
        contact.id,
        accountDetails.accountNumber,
        accountDetails.ifsc,
        accountDetails.accountHolderName,
      );
      await this.claims.update(claim.id, {
        razorpayFundAccountId: fundAccount.id,
      });
    } catch (error) {
      const reason =
        error instanceof RazorpayXRequestError
          ? error.message
          : 'Unable to prepare the recipient bank account';
      await this.failAndRefund(claim.id, reason);
      return;
    }

    const preparedClaim = await this.claims.findOneByOrFail({ id: claim.id });
    await this.sendPayout(preparedClaim);
  }

  private async sendPayout(claim: Claim): Promise<void> {
    if (!claim.razorpayFundAccountId) {
      throw new BadRequestException(
        'The recipient bank account is not ready for payout',
      );
    }

    let payout;
    try {
      payout = await this.razorpayX.createPayout(
        claim.razorpayFundAccountId,
        Number(claim.amount),
        claim.referenceId,
        claim.payoutIdempotencyKey,
      );
    } catch (error) {
      if (error instanceof RazorpayXRequestError && error.outcomeUnknown) {
        return;
      }

      const reason =
        error instanceof RazorpayXRequestError
          ? error.message
          : 'RazorpayX rejected the payout request';
      await this.failAndRefund(claim.id, reason);
      return;
    }

    await this.applyPayoutStatus(claim.id, payout);
  }

  private async failAndRefund(
    claimId: number,
    reason: string,
    payoutId?: string,
    allowCompleted = false,
  ): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      const claim = await manager.findOne(Claim, {
        where: { id: claimId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !claim ||
        claim.status === ClaimStatus.FAILED ||
        (claim.status === ClaimStatus.COMPLETED && !allowCompleted)
      ) {
        return false;
      }

      claim.status = ClaimStatus.FAILED;
      claim.failureReason = reason.slice(0, 255);
      if (payoutId) claim.razorpayPayoutId = payoutId;
      await manager.save(claim);

      const alreadyRefunded = await manager.findOne(WalletTransaction, {
        where: { referenceId: `refund-${claim.referenceId}` },
      });
      if (!alreadyRefunded) {
        await this.walletService.refundClaim(
          manager,
          claim.walletId,
          Number(claim.amount),
          claim.referenceId,
        );
      }
      return true;
    });
  }

  /** The wallet ledger is the sole source of claimable funds. */
  private async availableBalance(
    userId: number,
    manager = this.db.manager,
  ): Promise<number> {
    const wallet = await manager.findOne(Wallet, { where: { userId } });
    return Number(wallet?.balance ?? 0);
  }

  private presentClaim(claim: Claim) {
    const {
      requestId: _requestId,
      payoutIdempotencyKey: _payoutIdempotencyKey,
      ...safeClaim
    } = claim;
    return safeClaim;
  }
}
