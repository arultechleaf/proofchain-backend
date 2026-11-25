import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Wallet,
  WalletTransaction,
  WalletTransactionType,
} from './wallet.entities';
import { Payment, PaymentDirection } from '../payments/payment.entity';
import { CreditWalletDto } from './wallet.dto';
import { User } from '../users/user.entity';
import { AuditLog } from '../audit/audit-log.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet) private readonly wallets: Repository<Wallet>,
  ) {}

  async balance(userId: number) {
    await this.syncIncomingPayments(userId);
    let wallet = await this.wallets.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await this.wallets.save(
        this.wallets.create({ userId, balance: '0.00' }),
      );
    }
    return Number(wallet.balance);
  }

  async syncIncomingPayments(userId: number, manager?: EntityManager) {
    const sync = async (transactionManager: EntityManager) => {
      const wallet = await this.ensure(transactionManager, userId);
      const [payments, creditedTransactions] = await Promise.all([
        transactionManager.find(Payment, {
          where: { createdBy: userId, direction: PaymentDirection.IN },
          select: { id: true, amount: true },
        }),
        transactionManager.find(WalletTransaction, {
          where: {
            walletId: wallet.id,
            type: WalletTransactionType.PAYMENT_CREDIT,
          },
          select: { referenceId: true },
        }),
      ]);
      const creditedReferences = new Set(
        creditedTransactions.map((transaction) => transaction.referenceId),
      );

      for (const payment of payments) {
        if (creditedReferences.has(`payment-credit-${payment.id}`)) continue;
        await this.creditIncomingPayment(
          transactionManager,
          userId,
          payment.id,
          Math.round(payment.amount * 100) / 100,
        );
      }
    };

    if (manager) {
      await sync(manager);
      return;
    }

    await this.wallets.manager.transaction(sync);
  }

  async ensure(manager: EntityManager, userId: number): Promise<Wallet> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(Wallet)
      .values({ userId, balance: '0.00' })
      .orIgnore()
      .updateEntity(false)
      .execute();
    const wallet = await manager.findOne(Wallet, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet for user ${userId} could not be created`);
    }
    return wallet;
  }

  async creditIncomingPayment(
    manager: EntityManager,
    userId: number,
    paymentId: number,
    amount: number,
  ) {
    const referenceId = `payment-credit-${paymentId}`;
    const existing = await manager.findOne(WalletTransaction, {
      where: { referenceId },
    });
    if (existing) {
      if (
        existing.type !== WalletTransactionType.PAYMENT_CREDIT ||
        Number(existing.amount) !== amount
      ) {
        throw new ConflictException(
          `Payment ${paymentId} already has a conflicting wallet transaction`,
        );
      }
      const wallet = await manager.findOne(Wallet, {
        where: { id: existing.walletId },
      });
      if (!wallet || wallet.userId !== userId) {
        throw new ConflictException(
          `Payment ${paymentId} is credited to a different wallet`,
        );
      }
      return;
    }

    const wallet = await this.ensure(manager, userId);
    wallet.balance = (Number(wallet.balance) + amount).toFixed(2);
    await manager.save(wallet);
    await manager.save(
      WalletTransaction,
      manager.create(WalletTransaction, {
        walletId: wallet.id,
        type: WalletTransactionType.PAYMENT_CREDIT,
        amount: amount.toFixed(2),
        referenceId,
        createdBy: userId,
        description: `Incoming payment ${paymentId}`,
      }),
    );
  }

  async reverseIncomingPayment(
    manager: EntityManager,
    paymentId: number,
    actorId: number,
  ) {
    const credit = await manager.findOne(WalletTransaction, {
      where: { referenceId: `payment-credit-${paymentId}` },
    });
    if (!credit) return;
    if (credit.type !== WalletTransactionType.PAYMENT_CREDIT) {
      throw new ConflictException(
        `Payment ${paymentId} has a conflicting wallet transaction`,
      );
    }

    const reversalReferenceId = `payment-credit-reversal-${paymentId}`;
    const existingReversal = await manager.findOne(WalletTransaction, {
      where: { referenceId: reversalReferenceId },
    });
    if (existingReversal) return;

    const wallet = await manager.findOne(Wallet, {
      where: { id: credit.walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(
        `Wallet ${credit.walletId} not found for payment reversal`,
      );
    }

    const laterClaimDebit = await manager.findOne(WalletTransaction, {
      where: {
        walletId: wallet.id,
        type: WalletTransactionType.CLAIM_DEBIT,
        id: MoreThan(credit.id),
      },
    });
    if (laterClaimDebit) {
      throw new BadRequestException(
        'This payment cannot be deleted because its wallet credit may have funded a claim',
      );
    }

    const amount = Number(credit.amount);
    if (Number(wallet.balance) < amount) {
      throw new ConflictException(
        'Wallet balance is inconsistent with the payment credit',
      );
    }

    wallet.balance = (Number(wallet.balance) - amount).toFixed(2);
    await manager.save(wallet);
    await manager.save(
      WalletTransaction,
      manager.create(WalletTransaction, {
        walletId: wallet.id,
        type: WalletTransactionType.PAYMENT_CREDIT_REVERSAL,
        amount: amount.toFixed(2),
        referenceId: reversalReferenceId,
        createdBy: actorId,
        description: `Reversal of incoming payment ${paymentId}`,
      }),
    );
  }

  async debitClaim(
    manager: EntityManager,
    wallet: Wallet,
    amount: number,
    referenceId: string,
  ) {
    wallet.balance = (Number(wallet.balance) - amount).toFixed(2);
    await manager.save(wallet);
    await manager.save(
      WalletTransaction,
      manager.create(WalletTransaction, {
        walletId: wallet.id,
        type: WalletTransactionType.CLAIM_DEBIT,
        amount: amount.toFixed(2),
        referenceId,
        description: 'Claim payout requested',
      }),
    );
  }

  async refundClaim(
    manager: EntityManager,
    walletId: number,
    amount: number,
    referenceId: string,
  ) {
    const wallet = await manager.findOne(Wallet, {
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) {
      throw new NotFoundException(
        `Wallet ${walletId} not found for claim refund`,
      );
    }
    wallet.balance = (Number(wallet.balance) + amount).toFixed(2);
    await manager.save(wallet);
    await manager.save(
      WalletTransaction,
      manager.create(WalletTransaction, {
        walletId,
        type: WalletTransactionType.CLAIM_REFUND,
        amount: amount.toFixed(2),
        referenceId: `refund-${referenceId}`,
        description: 'Claim payout refunded',
      }),
    );
  }

  async creditApproved(userId: number, actorId: number, dto: CreditWalletDto) {
    const amount = Math.round(dto.amount * 100) / 100;
    const reason = dto.reason.trim();
    if (reason.length < 3) {
      throw new BadRequestException('Enter an approval reason or reference');
    }
    const referenceId = `admin-credit-${userId}-${dto.requestId}`;
    const existing = await this.wallets.manager.findOne(WalletTransaction, {
      where: { referenceId },
    });
    if (existing) return this.creditResult(existing, amount, reason);

    try {
      return await this.wallets.manager.transaction(async (manager) => {
        const user = await manager.findOne(User, { where: { id: userId } });
        if (!user || !user.isActive) {
          throw new NotFoundException('Active user not found');
        }

        const duplicate = await manager.findOne(WalletTransaction, {
          where: { referenceId },
        });
        if (duplicate) return this.creditResult(duplicate, amount, reason);

        const wallet = await this.ensure(manager, userId);

        wallet.balance = (Number(wallet.balance) + amount).toFixed(2);
        await manager.save(wallet);
        const transaction = await manager.save(
          WalletTransaction,
          manager.create(WalletTransaction, {
            walletId: wallet.id,
            type: WalletTransactionType.ADMIN_CREDIT,
            amount: amount.toFixed(2),
            referenceId,
            createdBy: actorId,
            description: reason,
          }),
        );
        await manager.save(
          AuditLog,
          manager.create(AuditLog, {
            actorId,
            action: 'WALLET_CREDIT_APPROVED',
            resourceType: 'wallet',
            resourceId: String(wallet.id),
            details: {
              userId,
              amount,
              reason,
              referenceId,
              walletTransactionId: transaction.id,
            },
          }),
        );

        return {
          balance: Number(wallet.balance),
          transaction,
          created: true,
        };
      });
    } catch (error) {
      const duplicate = await this.wallets.manager.findOne(WalletTransaction, {
        where: { referenceId },
      });
      if (duplicate) return this.creditResult(duplicate, amount, reason);
      throw error;
    }
  }

  private async creditResult(
    transaction: WalletTransaction,
    amount: number,
    reason: string,
  ) {
    if (
      transaction.type !== WalletTransactionType.ADMIN_CREDIT ||
      Number(transaction.amount) !== amount ||
      transaction.description !== reason
    ) {
      throw new ConflictException(
        'This credit request ID has already been used with different details',
      );
    }
    const wallet = await this.wallets.findOneByOrFail({
      id: transaction.walletId,
    });
    return {
      balance: Number(wallet.balance),
      transaction,
      created: false,
    };
  }
}
