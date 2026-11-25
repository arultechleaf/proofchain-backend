import { BadRequestException } from '@nestjs/common';
import { EntityManager, Repository } from 'typeorm';
import { vi } from 'vitest';
import {
  Wallet,
  WalletTransaction,
  WalletTransactionType,
} from './wallet.entities';
import { WalletService } from './wallet.service';

function createManager() {
  const insertBuilder = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    updateEntity: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  const manager = {
    createQueryBuilder: vi.fn().mockReturnValue(insertBuilder),
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn().mockImplementation((_entity, value) => Promise.resolve(value)),
    create: vi.fn((_entity, value) => value),
  };

  return { manager, insertBuilder };
}

describe('WalletService payment credits', () => {
  it('backfills incoming payments for the wallet owner once', async () => {
    const wallet = { id: 8, userId: 12, balance: '0.00' };
    const { manager, insertBuilder } = createManager();
    manager.findOne
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wallet);
    manager.find
      .mockResolvedValueOnce([{ id: 45, amount: 25 }])
      .mockResolvedValueOnce([]);
    const service = new WalletService(
      {} as Repository<Wallet>,
    );

    await service.syncIncomingPayments(
      12,
      manager as unknown as EntityManager,
    );

    expect(insertBuilder.updateEntity).toHaveBeenCalledWith(false);
    expect(wallet.balance).toBe('25.00');
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      WalletTransaction,
      expect.objectContaining({
        type: WalletTransactionType.PAYMENT_CREDIT,
        referenceId: 'payment-credit-45',
      }),
    );
  });

  it('credits the payment creator and records an idempotent wallet transaction', async () => {
    const wallet = { id: 8, userId: 12, balance: '10.00' };
    const { manager, insertBuilder } = createManager();
    manager.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wallet);
    const service = new WalletService(
      {} as Repository<Wallet>,
    );

    await service.creditIncomingPayment(
      manager as unknown as EntityManager,
      12,
      45,
      7.25,
    );

    expect(wallet.balance).toBe('17.25');
    expect(insertBuilder.execute).toHaveBeenCalledOnce();
    expect(manager.save).toHaveBeenNthCalledWith(1, wallet);
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      WalletTransaction,
      expect.objectContaining({
        walletId: 8,
        type: WalletTransactionType.PAYMENT_CREDIT,
        amount: '7.25',
        referenceId: 'payment-credit-45',
        createdBy: 12,
      }),
    );
  });

  it('blocks deletion when a claim debit followed the payment credit', async () => {
    const credit: Partial<WalletTransaction> = {
      id: 20,
      walletId: 8,
      type: WalletTransactionType.PAYMENT_CREDIT,
      amount: '25.00',
    };
    const wallet = { id: 8, userId: 12, balance: '5.00' };
    const { manager } = createManager();
    manager.findOne
      .mockResolvedValueOnce(credit)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce({ id: 21 });
    const service = new WalletService(
      {} as Repository<Wallet>,
    );

    await expect(
      service.reverseIncomingPayment(
        manager as unknown as EntityManager,
        45,
        12,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('reverses an unused payment credit without deleting its ledger history', async () => {
    const credit: Partial<WalletTransaction> = {
      id: 20,
      walletId: 8,
      type: WalletTransactionType.PAYMENT_CREDIT,
      amount: '25.00',
    };
    const wallet = { id: 8, userId: 12, balance: '40.00' };
    const { manager } = createManager();
    manager.findOne
      .mockResolvedValueOnce(credit)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce(null);
    const service = new WalletService(
      {} as Repository<Wallet>,
    );

    await service.reverseIncomingPayment(
      manager as unknown as EntityManager,
      45,
      99,
    );

    expect(wallet.balance).toBe('15.00');
    expect(manager.save).toHaveBeenNthCalledWith(1, wallet);
    expect(manager.save).toHaveBeenNthCalledWith(
      2,
      WalletTransaction,
      expect.objectContaining({
        walletId: 8,
        type: WalletTransactionType.PAYMENT_CREDIT_REVERSAL,
        amount: '25.00',
        referenceId: 'payment-credit-reversal-45',
        createdBy: 99,
      }),
    );
  });
});
