import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { Delivery } from '../deliveries/delivery.entity';
import { ProofRecord } from '../proofs/proof-record.entity';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, ProofRecord]),
    BlockchainModule,
    AuditModule,
  ],
  providers: [VerificationService],
  controllers: [VerificationController],
})
export class VerificationModule {}
