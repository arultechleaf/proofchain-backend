import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from '../deliveries/delivery.entity';
import { ProofRecord, VerificationStatus } from '../proofs/proof-record.entity';
import { BlockchainService } from '../blockchain/blockchain.service';
import { AuditService } from '../audit/audit.service';

export interface VerificationResult {
  deliveryId: number;
  deliveryReference: string;
  status: VerificationStatus;
  expectedHash: string | null;
  calculatedHash: string | null;
  hashMatch: boolean;
  blockchainRecord: {
    transactionHash: string | null;
    blockNumber: number | null;
    contractAddress: string | null;
    onChainMatch: boolean;
    error?: string;
  };
  verifiedAt: string;
  blockchainMode: 'live' | 'demo';
}

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(ProofRecord)
    private readonly proofRepo: Repository<ProofRecord>,
    private readonly blockchainService: BlockchainService,
    private readonly auditService: AuditService,
  ) {}

  async verifyDelivery(
    deliveryId: number,
    actorId: number,
  ): Promise<VerificationResult> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
      relations: { senderCompany: true, receiverCompany: true },
    });
    if (!delivery) throw new NotFoundException(`Delivery ${deliveryId} not found`);

    const proof = await this.proofRepo.findOne({
      where: { deliveryId },
      relations: { blockchainTransaction: true },
    });

    const verifiedAt = new Date().toISOString();

    // Recalculate hash from current delivery payload
    const { hexHash: calculatedHash, bytes32Hash } =
      this.blockchainService.computeProofHash({
        deliveryId: delivery.id,
        deliveryReference: delivery.deliveryReference,
        senderCompanyId: delivery.senderCompanyId,
        receiverCompanyId: delivery.receiverCompanyId,
        description: delivery.description,
        quantity: delivery.quantity,
        metadata: delivery.metadata,
      });

    const expectedHash = delivery.payloadHash;
    const hashMatch = expectedHash === calculatedHash;

    // Check blockchain record
    const onChainCheck = await this.blockchainService.verifyProofOnChain(
      deliveryId,
      bytes32Hash,
    );

    let status: VerificationStatus;
    if (!proof) {
      status = VerificationStatus.NOT_FOUND;
    } else if (!hashMatch) {
      status = VerificationStatus.MISMATCH;
    } else if (this.blockchainService.mode === 'demo') {
      status = VerificationStatus.VERIFIED; // demo mode assumes verified if hash matches
    } else if (onChainCheck.error) {
      status = VerificationStatus.PENDING;
    } else if (onChainCheck.matches) {
      status = VerificationStatus.VERIFIED;
    } else {
      status = VerificationStatus.MISMATCH;
    }

    // Update proof record
    if (proof) {
      proof.verificationStatus = status;
      proof.verifiedAt = new Date();
      await this.proofRepo.save(proof);
    }

    await this.auditService.log({
      actorId,
      action: 'VERIFY_DELIVERY',
      resourceType: 'delivery',
      resourceId: deliveryId,
      details: { status, hashMatch, onChainMatch: onChainCheck.matches },
    });

    return {
      deliveryId,
      deliveryReference: delivery.deliveryReference,
      status,
      expectedHash,
      calculatedHash,
      hashMatch,
      blockchainRecord: {
        transactionHash: proof?.blockchainTransaction?.transactionHash ?? null,
        blockNumber: proof?.blockchainTransaction?.blockNumber ?? null,
        contractAddress: proof?.blockchainTransaction?.contractAddress ?? null,
        onChainMatch: onChainCheck.matches ?? false,
        error: onChainCheck.error,
      },
      verifiedAt,
      blockchainMode: this.blockchainService.mode,
    };
  }
}
