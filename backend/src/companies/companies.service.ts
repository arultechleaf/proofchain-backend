import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { Company, CompanyType } from './company.entity';
import { User } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';

export class CreateCompanyDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsString() @MaxLength(50) @Matches(/^[A-Za-z0-9_-]+$/, { message: 'organizationCode may only contain letters, numbers, - and _' })
  organizationCode: string;

  @IsEnum(CompanyType)
  organizationType: CompanyType;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @Matches(/^([0-9A-Za-z]{15})?$/, { message: 'GSTIN must be 15 letters/digits' })
  gstin?: string;
}

export class UpdateCompanyDto extends PartialType(CreateCompanyDto) {
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  async findAll(): Promise<Company[]> {
    return this.companyRepo.find({ order: { name: 'ASC' } });
  }

  async findById(id: number): Promise<Company | null> {
    return this.companyRepo.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<Company | null> {
    return this.companyRepo.findOne({ where: { organizationCode: code } });
  }

  /** Organization with its members (secrets stripped). */
  async getDetail(id: number) {
    const company = await this.findById(id);
    if (!company) throw new NotFoundException('Organization not found');
    const users = await this.userRepo.find({ where: { companyId: id }, order: { name: 'ASC' } });
    return {
      ...company,
      users: users.map(({ passwordHash: _p, resetTokenHash: _r, resetTokenExpires: _e, ...u }) => u),
    };
  }

  async create(dto: CreateCompanyDto, actorId: number): Promise<Company> {
    const code = dto.organizationCode.trim().toUpperCase();
    if (await this.findByCode(code)) throw new ConflictException(`Organization code ${code} is already used`);
    const company = await this.companyRepo.save(
      this.companyRepo.create({
        name: dto.name.trim(),
        organizationCode: code,
        organizationType: dto.organizationType,
        description: dto.description ?? (null as any),
        gstin: dto.gstin?.trim().toUpperCase() || null,
      }),
    );
    await this.audit.log({
      actorId, action: 'COMPANY_CREATED', resourceType: 'company', resourceId: company.id,
      details: { name: company.name, code },
    });
    return company;
  }

  async update(id: number, dto: UpdateCompanyDto, actorId: number): Promise<Company> {
    const company = await this.findById(id);
    if (!company) throw new NotFoundException('Organization not found');

    if (dto.organizationCode !== undefined) {
      const code = dto.organizationCode.trim().toUpperCase();
      const clash = await this.findByCode(code);
      if (clash && clash.id !== id) throw new ConflictException(`Organization code ${code} is already used`);
      company.organizationCode = code;
    }
    if (dto.name !== undefined) company.name = dto.name.trim();
    if (dto.organizationType !== undefined) company.organizationType = dto.organizationType;
    if (dto.description !== undefined) company.description = dto.description;
    if (dto.gstin !== undefined) company.gstin = dto.gstin.trim().toUpperCase() || null;
    if (dto.isActive !== undefined) company.isActive = dto.isActive;

    const saved = await this.companyRepo.save(company);
    await this.audit.log({ actorId, action: 'COMPANY_UPDATED', resourceType: 'company', resourceId: id });
    return saved;
  }
}
