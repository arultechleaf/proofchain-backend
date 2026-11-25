import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Screen } from '../auth/screen.decorator';
import { ScreenGuard } from '../auth/screen.guard';
import { CreateUserDto, UpdateUserDto } from '../users/users.service';
import {
  CompanySelfService, SaveBranchDto, SetTeamAccessDto, UpdateCompanyProfileDto, UpdateCompanySettingsDto,
} from './company-self.service';

/** Pages every business company has for itself: profile, bank & invoice settings, branches and its own team. */
@ApiTags('company')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
@Controller('company')
export class CompanySelfController {
  constructor(private readonly service: CompanySelfService) {}

  // ── profile ──
  @Get('profile')
  @Screen('company_profile', { readAlso: ['sales', 'purchases', 'sales_create', 'purchases_create', 'quotations'] })
  @ApiOperation({ summary: 'The signed-in user company' })
  async profile(@Request() req) {
    return { data: await this.service.getProfile(req.user) };
  }

  @Patch('profile')
  @Screen('company_profile')
  @ApiOperation({ summary: 'Update the company business details' })
  async updateProfile(@Body() body: UpdateCompanyProfileDto, @Request() req) {
    return { data: await this.service.updateProfile(body, req.user) };
  }

  // ── bank & invoice settings ──
  @Get('settings')
  @Screen('company_settings', { readAlso: ['sales', 'purchases', 'sales_create', 'purchases_create', 'quotations'] })
  @ApiOperation({ summary: 'Bank details and invoice defaults' })
  async settings(@Request() req) {
    return { data: await this.service.getSettings(req.user) };
  }

  @Put('settings')
  @Screen('company_settings')
  @ApiOperation({ summary: 'Update bank details and invoice defaults' })
  async updateSettings(@Body() body: UpdateCompanySettingsDto, @Request() req) {
    return { data: await this.service.updateSettings(body, req.user) };
  }

  // ── branches / godowns ──
  @Get('branches')
  @Screen('branches', { readAlso: ['sales_create', 'purchases_create', 'sales', 'purchases', 'inventory', 'stock_entry', 'items', 'company_inventory'] })
  @ApiOperation({ summary: 'The company branches and godowns' })
  async branches(@Request() req) {
    return { data: await this.service.listBranches(req.user) };
  }

  @Post('branches')
  @Screen('branches')
  @ApiOperation({ summary: 'Add a branch or godown' })
  async createBranch(@Body() body: SaveBranchDto, @Request() req) {
    return { data: await this.service.createBranch(body, req.user) };
  }

  @Patch('branches/:id')
  @Screen('branches')
  @ApiOperation({ summary: 'Update a branch or godown' })
  async updateBranch(@Param('id', ParseIntPipe) id: number, @Body() body: SaveBranchDto, @Request() req) {
    return { data: await this.service.updateBranch(id, body, req.user) };
  }

  @Delete('branches/:id')
  @Screen('branches')
  @ApiOperation({ summary: 'Delete a branch or godown' })
  async removeBranch(@Param('id', ParseIntPipe) id: number, @Request() req) {
    await this.service.removeBranch(id, req.user);
    return { data: { deleted: 1 } };
  }

  // ── team ──
  @Get('team')
  @Screen('company_team')
  @ApiOperation({ summary: 'People of the signed-in user company' })
  async team(@Request() req) {
    return { data: await this.service.listTeam(req.user) };
  }

  @Get('team/roles')
  @Screen('company_team')
  @ApiOperation({ summary: 'Roles a company may give to its staff' })
  async teamRoles() {
    return { data: await this.service.teamRoles() };
  }

  @Post('team')
  @Screen('company_team')
  @ApiOperation({ summary: 'Add a person to your company (temporary password, changed at first sign-in)' })
  async addMember(@Body() body: CreateUserDto, @Request() req) {
    return { data: await this.service.addMember(body, req.user) };
  }

  @Patch('team/:id')
  @Screen('company_team')
  @ApiOperation({ summary: 'Update or deactivate a team member' })
  async updateMember(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserDto, @Request() req) {
    return { data: await this.service.updateMember(id, body, req.user) };
  }

  @Get('team/:id/access')
  @Screen('company_team')
  @ApiOperation({ summary: 'The screens of a team member' })
  async memberAccess(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return { data: await this.service.memberAccess(id, req.user) };
  }

  @Put('team/:id/access')
  @Screen('company_team')
  @ApiOperation({ summary: 'Set which screens a team member can open' })
  async setMemberAccess(@Param('id', ParseIntPipe) id: number, @Body() body: SetTeamAccessDto, @Request() req) {
    return { data: await this.service.setMemberAccess(id, body, req.user) };
  }
}
