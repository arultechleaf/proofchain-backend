import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Screen } from '../auth/screen.decorator';
import { ScreenGuard } from '../auth/screen.guard';
import { CreateRoleDto, RolePermissionsService, UpdatePermissionsDto } from './role-permissions.service';

@ApiTags('roles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Controller('roles')
export class RolePermissionsController {
  constructor(private readonly service: RolePermissionsService) {}

  /** Open to every signed-in user: the sidebar and route guard are built from this. */
  @Get('permissions/me')
  @ApiOperation({ summary: 'Screens and the access level the signed-in user has on each' })
  async mine(@Request() req) {
    return { data: { role: req.user.role, screens: await this.service.forUser(req.user.role) } };
  }

  /** The role list is needed by the user form, so any signed-in user may read it. */
  @Get()
  @ApiOperation({ summary: 'List the roles that can be assigned to users' })
  async roles() {
    return { data: await this.service.roleList() };
  }

  @Get('permissions')
  @Screen('roles')
  @ApiOperation({ summary: 'Permission matrix: what each role may do on each screen' })
  async matrix() {
    return { data: await this.service.matrix() };
  }

  @Put('permissions')
  @Screen('roles')
  @ApiOperation({ summary: 'Change one or more role permissions' })
  async update(@Body() body: UpdatePermissionsDto, @Request() req) {
    return { data: await this.service.update(body, req.user.id) };
  }

  @Post()
  @Screen('roles')
  @ApiOperation({ summary: 'Create a role (it starts with no access)' })
  async create(@Body() body: CreateRoleDto, @Request() req) {
    return { data: await this.service.createRole(body, req.user.id) };
  }

  @Delete(':key')
  @Screen('roles')
  @ApiOperation({ summary: 'Delete a custom role that no user has' })
  async remove(@Param('key') key: string, @Request() req) {
    return { data: await this.service.deleteRole(key, req.user.id) };
  }
}
