import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Approval, ApprovalDecision } from './approval.entity';
import { Delivery, DeliveryStatus } from '../deliveries/delivery.entity';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../users/user.entity';
import { BlockchainService } from '../blockchain/blockchain.service';
import {
  BlockchainTransaction,
  BlockchainTxType,
  BlockchainTxStatus,
} from '../blockchain/blockchain-transaction.entity';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApprovalDto {
  @ApiProperty({ enum: ApprovalDecision })
  @IsEnum(ApprovalDecision)
  decision: ApprovalDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;
}

@Injectable()
export class ApprovalsService {
  constructor(
    @InjectRepository(Approval)
    private readonly approvalRepo: Repository<Approval>,
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(BlockchainTransaction)
    private readonly txRepo: Repository<BlockchainTransaction>,
    private readonly blockchainService: BlockchainService,
    private readonly auditService: AuditService,
  ) {}

  async createApproval(
    deliveryId: string,
    dto: CreateApprovalDto,
    reviewerId: string,
    reviewerRole: string,
    reviewerCompanyId: string | null,
  ): Promise<Approval> {
    // Only Company B can approve/reject deliveries
    if (reviewerRole !== UserRole.COMPANY_B && reviewerRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only Company B can approve or reject deliveries');
    }

    const delivery = await this.deliveryRepo.findOne({ where: { id: deliveryId } });
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`);

    // Ensure the reviewer belongs to the receiver company
    if (
      reviewerRole === UserRole.COMPANY_B &&
      reviewerCompanyId &&
      delivery.receiverCompanyId !== reviewerCompanyId
    ) {
      throw new ForbiddenException(
        'You can only approve deliveries addressed to your organization',
      );
    }

    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException(
        `Delivery is already ${delivery.status} and cannot be reviewed again`,
      );
    }

    // Save approval record
    const approval = this.approvalRepo.create({
      deliveryId,
      reviewerId,
      decision: dto.decision,
      comment: dto.comment ?? null,
    });
    await this.approvalRepo.save(approval);

    // Update delivery status
    delivery.status =
      dto.decision === ApprovalDecision.APPROVED
        ? DeliveryStatus.APPROVED
        : DeliveryStatus.REJECTED;
    await this.deliveryRepo.save(delivery);

    // Submit status update to blockchain
    try {
      const dbTx = this.txRepo.create({
        deliveryId,
        transactionType: BlockchainTxType.STATUS_UPDATE,
        status: BlockchainTxStatus.PENDING,
      });
      await this.txRepo.save(dbTx);
      const statusCode = dto.decision === ApprovalDecision.APPROVED ? 1 : 2;
      await this.blockchainService.registerProof(deliveryId, '0x' + '0'.repeat(63) + statusCode, dbTx);
    } catch {}

    await this.auditService.log({
      actorId: reviewerId,
      action: `DELIVERY_${dto.decision.toUpperCase()}`,
      resourceType: 'delivery',
      resourceId: deliveryId,
      details: { decision: dto.decision, comment: dto.comment },
    });

    return approval;
  }

  async getApprovalsByDelivery(deliveryId: string): Promise<Approval[]> {
    return this.approvalRepo.find({
      where: { deliveryId },
      relations: { reviewer: true },
      order: { createdAt: 'DESC' },
    });
  }
}
