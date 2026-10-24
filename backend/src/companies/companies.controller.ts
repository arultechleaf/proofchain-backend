import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CompaniesService, CreateCompanyDto, UpdateCompanyDto,
} from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('companies')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'List all organizations' })
  async findAll() {
    const companies = await this.companiesService.findAll();
    return { data: companies };
  }

  @Get(':id')
  @Roles('admin', 'auditor')
  @ApiOperation({ summary: 'Organization with its users' })
  async findOne(@Param('id') id: string) {
    return { data: await this.companiesService.getDetail(id) };
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create an organization (admin only)' })
  async create(@Body() body: CreateCompanyDto, @Request() req) {
    return { data: await this.companiesService.create(body, req.user.id) };
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update an organization (admin only)' })
  async update(@Param('id') id: string, @Body() body: UpdateCompanyDto, @Request() req) {
    return { data: await this.companiesService.update(id, body, req.user.id) };
  }
}
