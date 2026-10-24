import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { Company } from './company.entity';
import { User } from '../users/user.entity';
import { AuditModule } from '../audit/audit.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Company, User]), AuditModule],
  providers: [CompaniesService, RolesGuard],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
