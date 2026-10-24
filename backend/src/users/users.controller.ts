import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreateUserDto, UpdateUserDto, UsersService, stripSecrets } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('admin', 'auditor')
  @ApiOperation({ summary: 'List all users' })
  async findAll() {
    const users = await this.usersService.findAll();
    return { data: users.map(stripSecrets) };
  }

  @Get(':id')
  @Roles('admin', 'auditor')
  @ApiOperation({ summary: 'Get a user' })
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return { data: stripSecrets(user) };
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a user (admin only)' })
  async create(@Body() body: CreateUserDto, @Request() req) {
    return { data: stripSecrets(await this.usersService.create(body, req.user.id)) };
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a user: name, role, organization, active flag, password (admin only)' })
  async update(@Param('id') id: string, @Body() body: UpdateUserDto, @Request() req) {
    return { data: stripSecrets(await this.usersService.update(id, body, req.user.id)) };
  }
}
