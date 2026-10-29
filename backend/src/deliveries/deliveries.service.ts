import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Like, Between } from 'typeorm';
import {
  Delivery,
  DeliveryStatus,
  BlockchainStatus,
} from './delivery.entity';
import {
  BlockchainTransaction,
  BlockchainTxStatus,
  BlockchainTxType,
} from '../blockchain/blockchain-transaction.entity';
import { ProofRecord, VerificationStatus } from '../proofs/proof-record.entity';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../users/user.entity';
import {
  IsString, IsInt, IsOptional, Min, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeliveryDto {
  @ApiProperty({ example: 'DEL-2024-001' })
  @IsString()
  deliveryReference: string;

  @ApiProperty({ description: 'UUID of the receiver company' })
  @Type(() => Number) @IsInt()
  receiverCompanyId: number;

  @ApiProperty({ example: 'Electronic components shipment' })
  @IsString()
  description: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DeliveryQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 20;
}

@Injectable()
export class DeliveriesService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(BlockchainTransaction)
    private readonly txRepo: Repository<BlockchainTransaction>,
    @InjectRepository(ProofRecord)
    private readonly proofRepo: Repository<ProofRecord>,
    private readonly blockchainService: BlockchainService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    dto: CreateDeliveryDto,
    actorId: number,
    senderCompanyId: number,
    actorRole: string,
  ): Promise<Delivery> {
    // Who may create deliveries is decided by the role permission matrix (screen "deliveries_create"), enforced by ScreenGuard.

    // Check for duplicate reference
    const existing = await this.deliveryRepo.findOne({
      where: { deliveryReference: dto.deliveryReference },
    });
    if (existing) {
      throw new ConflictException(
        `Delivery reference ${dto.deliveryReference} already exists`,
      );
    }

    // 1. Create and save initial delivery record
    const delivery = this.deliveryRepo.create({
      deliveryReference: dto.deliveryReference,
      senderCompanyId,
      receiverCompanyId: dto.receiverCompanyId,
      description: dto.description,
      quantity: dto.quantity,
      metadata: dto.metadata ?? null,
      status: DeliveryStatus.PENDING,
      blockchainStatus: BlockchainStatus.NOT_SUBMITTED,
      createdBy: actorId,
    });
    await this.deliveryRepo.save(delivery);

    // 2. Compute canonical payload hash
    const { hexHash, bytes32Hash, canonicalPayload } =
      this.blockchainService.computeProofHash({
        deliveryId: delivery.id,
        deliveryReference: delivery.deliveryReference,
        senderCompanyId: delivery.senderCompanyId,
        receiverCompanyId: delivery.receiverCompanyId,
        description: delivery.description,
        quantity: delivery.quantity,
        metadata: delivery.metadata,
      });

    delivery.payloadHash = hexHash;
    await this.deliveryRepo.save(delivery);

    // 3. Create blockchain transaction record
    const dbTx = this.txRepo.create({
      deliveryId: delivery.id,
      transactionType: BlockchainTxType.PROOF_REGISTRATION,
      status: BlockchainTxStatus.PENDING,
      contractAddress: null,
    });
    await this.txRepo.save(dbTx);

    // 4. Submit proof to blockchain (or simulate in demo mode)
    const updatedTx = await this.blockchainService.registerProof(
      delivery.id,
      bytes32Hash,
      dbTx,
    );

    // 5. Create proof record
    const proofRecord = this.proofRepo.create({
      deliveryId: delivery.id,
      algorithm: 'SHA-256',
      payloadHash: hexHash,
      blockchainTransactionId: updatedTx.id,
      canonicalPayload,
      verificationStatus:
        updatedTx.status === BlockchainTxStatus.CONFIRMED
          ? VerificationStatus.VERIFIED
          : VerificationStatus.PENDING,
    });
    await this.proofRepo.save(proofRecord);

    // 6. Update delivery blockchain status
    delivery.blockchainStatus =
      updatedTx.status === BlockchainTxStatus.CONFIRMED
        ? BlockchainStatus.CONFIRMED
        : updatedTx.status === BlockchainTxStatus.FAILED
          ? BlockchainStatus.FAILED
          : BlockchainStatus.PENDING;
    await this.deliveryRepo.save(delivery);

    // 7. Audit log
    await this.auditService.log({
      actorId,
      action: 'CREATE_DELIVERY',
      resourceType: 'delivery',
      resourceId: delivery.id,
      details: {
        deliveryReference: delivery.deliveryReference,
        payloadHash: hexHash,
        blockchainMode: this.blockchainService.mode,
        transactionHash: updatedTx.transactionHash,
      },
    });

    await this.notifications.notifyCompany(delivery.receiverCompanyId, {
      type: 'delivery',
      title: 'New delivery received',
      message: `Delivery ${delivery.deliveryReference} is waiting for your approval.`,
      link: `/deliveries/${delivery.id}`,
    }, actorId);

    return this.findById(delivery.id);
  }

  async findAll(
    query: DeliveryQueryDto,
    actorRole: string,
    actorCompanyId: number | null,
  ): Promise<{ data: Delivery[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.deliveryRepo
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.senderCompany', 'sender')
      .leftJoinAndSelect('d.receiverCompany', 'receiver')
      .leftJoinAndSelect('d.creator', 'creator')
      .orderBy('d.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    // Role-based visibility
    if (actorRole === UserRole.COMPANY_A && actorCompanyId) {
      qb.andWhere('d.senderCompanyId = :companyId', { companyId: actorCompanyId });
    } else if (actorRole === UserRole.COMPANY_B && actorCompanyId) {
      qb.andWhere('d.receiverCompanyId = :companyId', { companyId: actorCompanyId });
    } else if (actorRole !== UserRole.ADMIN && actorRole !== UserRole.AUDITOR) {
      // managers, users and custom roles see deliveries their organization sends or receives
      qb.andWhere('(d.senderCompanyId = :companyId OR d.receiverCompanyId = :companyId)', { companyId: actorCompanyId ?? '__none__' });
    }
    // AUDITOR and ADMIN see all deliveries

    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }
    if (query.search) {
      qb.andWhere(
        '(d.deliveryReference LIKE :s OR d.description LIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findById(id: number): Promise<Delivery> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id },
      relations: { senderCompany: true, receiverCompany: true, creator: true },
    });
    if (!delivery) throw new NotFoundException(`Delivery ${id} not found`);
    return delivery;
  }

  async getProofDetails(deliveryId: number) {
    const proof = await this.proofRepo.findOne({
      where: { deliveryId },
      relations: { blockchainTransaction: true },
    });
    return proof;
  }
}
