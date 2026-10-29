import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Request, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreateUserDto, UpdateUserDto, UsersService, stripSecrets } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Screen('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  async findAll() {
    const users = await this.usersService.findAll();
    return { data: users.map(stripSecrets) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return { data: stripSecrets(user) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a user (admin only)' })
  async create(@Body() body: CreateUserDto, @Request() req) {
    return { data: stripSecrets(await this.usersService.create(body, req.user.id)) };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user: name, role, organization, active flag, password (admin only)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserDto, @Request() req) {
    return { data: stripSecrets(await this.usersService.update(id, body, req.user.id)) };
  }
}
