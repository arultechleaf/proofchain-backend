import { Module, OnModuleInit } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Notification } from '../notifications/notification.entity';
import { UsersModule } from '../users/users.module';
import { EmailOtpModule } from '../email-otp/email-otp.module';
import { RolePermissionsModule } from '../role-permissions/role-permissions.module';
import { STORE_ENTITIES, StoreCategory } from './store.entities';
import { StoreCoreService } from './store-core.service';
import { StoreAuthController, StoreAuthService } from './store-auth.controller';
import { StoreCustomerController, StoreCustomerMeController, StoreCustomerService } from './store-customer.controller';
import { StoreOwnerController, StoreOwnerService } from './store-owner.controller';
import { StoreWorkerController, StoreWorkerService } from './store-worker.controller';
import { StoreUploadController } from './store-upload.controller';
import { StoreAdminController } from './store-admin.controller';

const DEFAULT_CATEGORIES: Array<[string, string]> = [
  ['Groceries', 'basket-outline'],
  ['Fruits & Vegetables', 'leaf-outline'],
  ['Dairy & Eggs', 'water-outline'],
  ['Snacks', 'fast-food-outline'],
  ['Beverages', 'cafe-outline'],
  ['Household', 'home-outline'],
  ['Personal Care', 'sparkles-outline'],
  ['Stationery', 'pencil-outline'],
  ['Electronics', 'phone-portrait-outline'],
  ['Other', 'pricetag-outline'],
];

/** Namma Store: the customer / shop-owner / shop-worker marketplace used by the mobile app. */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Notification, ...STORE_ENTITIES]),
    UsersModule,
    EmailOtpModule,
    RolePermissionsModule,
  ],
  providers: [StoreCoreService, StoreAuthService, StoreCustomerService, StoreOwnerService, StoreWorkerService],
  controllers: [StoreAuthController, StoreCustomerController, StoreCustomerMeController, StoreOwnerController, StoreWorkerController, StoreUploadController, StoreAdminController],
})
export class StoreModule implements OnModuleInit {
  constructor(@InjectRepository(StoreCategory) private readonly categories: Repository<StoreCategory>) {}

  /** First start: add the default product categories. */
  async onModuleInit() {
    if ((await this.categories.count()) > 0) return;
    await this.categories.save(
      DEFAULT_CATEGORIES.map(([name, icon], i) => this.categories.create({ name, icon, sortOrder: i + 1 })),
    );
  }
}
