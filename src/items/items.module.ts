import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './item.entity';
import { StockMovement } from './stock-movement.entity';
import { ItemBranchStock } from './item-branch-stock.entity';
import { Branch } from '../company-self/company-self.entities';
import { Company } from '../companies/company.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Item, StockMovement, ItemBranchStock, Branch, Company]), AuditModule, NotificationsModule],
  providers: [ItemsService],
  controllers: [ItemsController],
  exports: [ItemsService],
})
export class ItemsModule {}
