import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProofRecord } from './proof-record.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProofRecord])],
  exports: [TypeOrmModule],
})
export class ProofsModule {}
