import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import {
  CompaniesService, CreateCompanyDto, UpdateCompanyDto,
} from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ScreenGuard } from '../auth/screen.guard';
import { Screen } from '../auth/screen.decorator';

@ApiTags('companies')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, ScreenGuard)
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
  @Screen('organizations')
  @ApiOperation({ summary: 'Organization with its users' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.companiesService.getDetail(id) };
  }

  @Post()
  @Screen('organizations')
  @ApiOperation({ summary: 'Create an organization (admin only)' })
  async create(@Body() body: CreateCompanyDto, @Request() req) {
    return { data: await this.companiesService.create(body, req.user.id) };
  }

  @Patch(':id')
  @Screen('organizations')
  @ApiOperation({ summary: 'Update an organization (admin only)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateCompanyDto, @Request() req) {
    return { data: await this.companiesService.update(id, body, req.user.id) };
  }
}
