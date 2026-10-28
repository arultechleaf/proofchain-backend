import { Body, Controller, Get, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RolePermissionsService, UpdatePermissionsDto } from './role-permissions.service';

@ApiTags('roles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles/permissions')
export class RolePermissionsController {
  constructor(private readonly service: RolePermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Permission matrix: what each role may do in each area' })
  async matrix() {
    return { data: await this.service.matrix() };
  }

  @Put()
  @Roles('admin')
  @ApiOperation({ summary: 'Change one or more role permissions (admin only)' })
  async update(@Body() body: UpdatePermissionsDto, @Request() req) {
    return { data: await this.service.update(body, req.user.id) };
  }
}
