import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/company.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { Branch, CompanySettings } from './company-self.entities';
import { ItemBranchStock } from '../items/item-branch-stock.entity';
import { StockMovement } from '../items/stock-movement.entity';
import { CompanySelfService } from './company-self.service';
import { CompanySelfController } from './company-self.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company, User, CompanySettings, Branch, ItemBranchStock, StockMovement]), UsersModule, AuditModule],
  providers: [CompanySelfService],
  controllers: [CompanySelfController],
  exports: [CompanySelfService],
})
export class CompanySelfModule {}
