import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role, RolePermission, Screen } from './role-permissions';
import { RolePermissionsService } from './role-permissions.service';
import { RolePermissionsController } from './role-permissions.controller';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/user.entity';
import { ScreenGuard } from '../auth/screen.guard';

/** Global so any controller can use `@Screen(...)` + `ScreenGuard` without importing this module. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Screen, RolePermission, User]), AuditModule],
  providers: [RolePermissionsService, ScreenGuard],
  controllers: [RolePermissionsController],
  exports: [RolePermissionsService, ScreenGuard],
})
export class RolePermissionsModule {}
