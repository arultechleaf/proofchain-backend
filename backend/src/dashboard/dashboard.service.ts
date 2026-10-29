import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { BlockchainTransaction, BlockchainTxStatus } from '../blockchain/blockchain-transaction.entity';
import { Approval } from '../approvals/approval.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(BlockchainTransaction)
    private readonly txRepo: Repository<BlockchainTransaction>,
    @InjectRepository(Approval)
    private readonly approvalRepo: Repository<Approval>,
  ) {}

  /** SQL expression that formats a datetime column as YYYY-MM-DD (MySQL or SQLite). */
  private dayExpr(column: string): string {
    const type = this.deliveryRepo.manager.connection.options.type as string;
    return type === 'mysql' || type === 'mariadb'
      ? `DATE_FORMAT(${column}, '%Y-%m-%d')`
      : `strftime('%Y-%m-%d', ${column})`;
  }

  async getSummary(actorRole: string, actorCompanyId: number | null) {
    const [total, pending, approved, rejected, txCount, confirmedTx] =
      await Promise.all([
        this.deliveryRepo.count(),
        this.deliveryRepo.count({ where: { status: DeliveryStatus.PENDING } }),
        this.deliveryRepo.count({ where: { status: DeliveryStatus.APPROVED } }),
        this.deliveryRepo.count({ where: { status: DeliveryStatus.REJECTED } }),
        this.txRepo.count(),
        this.txRepo.count({ where: { status: BlockchainTxStatus.CONFIRMED } }),
      ]);

    const verificationRate =
      txCount > 0 ? Math.round((confirmedTx / txCount) * 100) : 0;

    return {
      totalDeliveries: total,
      pendingApprovals: pending,
      approvedDeliveries: approved,
      rejectedDeliveries: rejected,
      blockchainTransactions: txCount,
      verificationSuccessRate: verificationRate,
    };
  }

  async getActivity() {
    // Last 7 days delivery activity
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const deliveries = await this.deliveryRepo
      .createQueryBuilder('d')
      .select(this.dayExpr('d.created_at'), 'date')
      .addSelect('COUNT(*)', 'count')
      .where('d.created_at >= :start', { start: sevenDaysAgo })
      .groupBy('date')
      .orderBy('date', 'ASC')
      .getRawMany();

    const recentDeliveries = await this.deliveryRepo.find({
      order: { createdAt: 'DESC' },
      take: 8,
      relations: { senderCompany: true, receiverCompany: true },
    });

    const recentTxs = await this.txRepo.find({
      order: { createdAt: 'DESC' },
      take: 5,
      relations: { delivery: true },
    });

    return {
      deliveryActivity: deliveries,
      recentDeliveries,
      recentTransactions: recentTxs,
    };
  }
}
