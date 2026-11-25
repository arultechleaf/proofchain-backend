import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { Company } from '../companies/company.entity';
import { User } from '../users/user.entity';
import { CreateUserDto, UpdateUserDto, UsersService, stripSecrets } from '../users/users.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/tenant';
import { Branch, CompanySettings } from './company-self.entities';
import { ItemBranchStock } from '../items/item-branch-stock.entity';
import { StockMovement } from '../items/stock-movement.entity';

const optional = (v: string | undefined | null) => (v == null || v.trim() === '' ? null : v.trim());

// ── DTOs ──────────────────────────────────────────────────────────────────

export class UpdateCompanyProfileDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @Matches(/^([0-9A-Za-z]{15})?$/, { message: 'GSTIN must be 15 letters/digits' })
  gstin?: string;

  @IsOptional() @Matches(/^([A-Za-z]{5}[0-9]{4}[A-Za-z])?$/, { message: 'PAN must look like ABCDE1234F' })
  pan?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MaxLength(80)
  state?: string;

  @IsOptional() @Matches(/^(\d{6})?$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @IsOptional() @Matches(/^(\+?[0-9 -]{7,15})?$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(255)
  email?: string;

  @IsOptional() @IsString() @MaxLength(255)
  website?: string;

  @IsOptional() @IsString() @MaxLength(500)
  logoUrl?: string;
}

export class UpdateCompanySettingsDto {
  @IsOptional() @IsString() @MaxLength(100)
  bankName?: string;

  @IsOptional() @IsString() @MaxLength(100)
  accountHolder?: string;

  @IsOptional() @Matches(/^([0-9]{6,30})?$/, { message: 'Account number must be digits only' })
  accountNumber?: string;

  @IsOptional() @Matches(/^([A-Za-z]{4}0[A-Za-z0-9]{6})?$/, { message: 'IFSC must look like HDFC0001234' })
  ifscCode?: string;

  @IsOptional() @IsString() @MaxLength(100)
  bankBranch?: string;

  @IsOptional() @Matches(/^([\w.\-]{2,}@[A-Za-z]{2,})?$/, { message: 'UPI id must look like name@bank' })
  upiId?: string;

  @IsOptional() @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Prefix must be 1-10 letters or digits' })
  salesPrefix?: string;

  @IsOptional() @Matches(/^[A-Za-z0-9]{1,10}$/, { message: 'Prefix must be 1-10 letters or digits' })
  purchasePrefix?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100)
  defaultTaxRate?: number;

  @IsOptional() @Matches(/^[A-Za-z]{3}$/, { message: 'Currency must be a 3-letter code such as INR' })
  currency?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(365)
  paymentTermsDays?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  terms?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  invoiceNotes?: string;

  @IsOptional() @IsString() @MaxLength(255)
  invoiceFooter?: string;
}

export class SaveBranchDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsString() @Matches(/^[A-Za-z0-9_-]{1,20}$/, { message: 'Code must be 1-20 letters, digits, - or _' })
  code: string;

  @IsOptional() @IsIn(['branch', 'godown'])
  kind?: string;

  @IsOptional() @IsString() @MaxLength(500)
  address?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @MaxLength(80)
  state?: string;

  @IsOptional() @Matches(/^(\d{6})?$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @IsOptional() @Matches(/^(\+?[0-9 -]{7,15})?$/, { message: 'Enter a valid phone number' })
  phone?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(100)
  contactPerson?: string;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class TeamAccessChangeDto {
  @IsString() @MaxLength(40)
  key: string;

  @IsOptional() @IsIn(['full', 'own', 'read', 'none'])
  level: 'full' | 'own' | 'read' | 'none' | null;
}

export class SetTeamAccessDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => TeamAccessChangeDto)
  screens: TeamAccessChangeDto[];
}

/** Roles a company may give to its own staff. Administrators and auditors work across companies, so they are not offered. */
const NOT_FOR_TEAM = new Set(['admin', 'auditor']);

@Injectable()
export class CompanySelfService {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(CompanySettings) private readonly settingsRepo: Repository<CompanySettings>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ItemBranchStock) private readonly stockRows: Repository<ItemBranchStock>,
    @InjectRepository(StockMovement) private readonly movements: Repository<StockMovement>,
    private readonly usersService: UsersService,
    private readonly rolePermissions: RolePermissionsService,
    private readonly audit: AuditService,
  ) {}

  /** The company the signed-in user belongs to. Every page here works on that company only. */
  private companyId(user: AuthUser): number {
    if (!user.companyId) throw new BadRequestException('Your account is not linked to an organization');
    return user.companyId;
  }

  // ── profile ──
  async getProfile(user: AuthUser) {
    const company = await this.companies.findOne({ where: { id: this.companyId(user) } });
    if (!company) throw new NotFoundException('Organization not found');
    return company;
  }

  async updateProfile(dto: UpdateCompanyProfileDto, user: AuthUser) {
    const company = await this.getProfile(user);
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new BadRequestException('Enter the business name');
      company.name = dto.name.trim();
    }
    for (const k of ['description', 'gstin', 'pan', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'website', 'logoUrl'] as const) {
      if (dto[k] !== undefined) {
        const v = optional(dto[k]);
        (company as any)[k] = (k === 'gstin' || k === 'pan') && v ? v.toUpperCase() : v;
      }
    }
    const saved = await this.companies.save(company);
    await this.audit.log({ actorId: user.id, action: 'COMPANY_PROFILE_UPDATED', resourceType: 'company', resourceId: saved.id });
    return saved;
  }

  // ── bank & invoice settings ──
  async getSettings(user: AuthUser): Promise<CompanySettings> {
    const companyId = this.companyId(user);
    return (await this.settingsRepo.findOne({ where: { companyId } })) ?? (await this.settingsRepo.save(this.settingsRepo.create({ companyId })));
  }

  async updateSettings(dto: UpdateCompanySettingsDto, user: AuthUser) {
    const row = await this.getSettings(user);
    for (const k of ['bankName', 'accountHolder', 'accountNumber', 'ifscCode', 'bankBranch', 'upiId', 'terms', 'invoiceNotes', 'invoiceFooter'] as const) {
      if (dto[k] !== undefined) {
        const v = optional(dto[k]);
        (row as any)[k] = k === 'ifscCode' && v ? v.toUpperCase() : v;
      }
    }
    if (dto.salesPrefix !== undefined) row.salesPrefix = dto.salesPrefix.toUpperCase();
    if (dto.purchasePrefix !== undefined) row.purchasePrefix = dto.purchasePrefix.toUpperCase();
    if (dto.defaultTaxRate !== undefined) row.defaultTaxRate = dto.defaultTaxRate;
    if (dto.currency !== undefined) row.currency = dto.currency.toUpperCase();
    if (dto.paymentTermsDays !== undefined) row.paymentTermsDays = dto.paymentTermsDays;
    const saved = await this.settingsRepo.save(row);
    await this.audit.log({ actorId: user.id, action: 'COMPANY_SETTINGS_UPDATED', resourceType: 'company', resourceId: row.companyId });
    return saved;
  }

  // ── branches / godowns ──
  async listBranches(user: AuthUser) {
    return this.branches.find({ where: { companyId: this.companyId(user) }, order: { isDefault: 'DESC', name: 'ASC' } });
  }

  private async ownBranch(id: number, user: AuthUser): Promise<Branch> {
    const row = await this.branches.findOne({ where: { id, companyId: this.companyId(user) } });
    if (!row) throw new NotFoundException('Branch not found');
    return row;
  }

  private async assertCodeFree(companyId: number, code: string, exceptId?: number) {
    const taken = await this.branches.findOne({ where: { companyId, code } });
    if (taken && taken.id !== exceptId) throw new ConflictException(`The code "${code}" is already used by another branch`);
  }

  private apply(row: Branch, dto: SaveBranchDto) {
    row.name = dto.name.trim();
    row.code = dto.code.trim().toUpperCase();
    row.kind = dto.kind ?? row.kind ?? 'branch';
    for (const k of ['address', 'city', 'state', 'pincode', 'phone', 'email', 'contactPerson'] as const) (row as any)[k] = optional(dto[k]);
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
  }

  /** Exactly one branch is the default; the first branch of a company becomes it automatically. */
  private async makeDefault(companyId: number, id: number) {
    await this.branches.update({ companyId }, { isDefault: false });
    await this.branches.update({ id }, { isDefault: true });
  }

  async createBranch(dto: SaveBranchDto, user: AuthUser) {
    const companyId = this.companyId(user);
    await this.assertCodeFree(companyId, dto.code.trim().toUpperCase());
    const row = this.branches.create({ companyId, isDefault: false });
    this.apply(row, dto);
    const saved = await this.branches.save(row);
    if (dto.isDefault || (await this.branches.count({ where: { companyId } })) === 1) await this.makeDefault(companyId, saved.id);
    await this.audit.log({ actorId: user.id, action: 'BRANCH_CREATED', resourceType: 'branch', resourceId: saved.id, details: { code: saved.code } });
    return this.ownBranch(saved.id, user);
  }

  async updateBranch(id: number, dto: SaveBranchDto, user: AuthUser) {
    const row = await this.ownBranch(id, user);
    await this.assertCodeFree(row.companyId, dto.code.trim().toUpperCase(), id);
    if (row.isDefault && dto.isActive === false) throw new BadRequestException('Make another branch the default before deactivating this one');
    this.apply(row, dto);
    await this.branches.save(row);
    if (dto.isDefault && !row.isDefault) await this.makeDefault(row.companyId, id);
    await this.audit.log({ actorId: user.id, action: 'BRANCH_UPDATED', resourceType: 'branch', resourceId: id });
    return this.ownBranch(id, user);
  }

  async removeBranch(id: number, user: AuthUser) {
    const row = await this.ownBranch(id, user);
    if (row.isDefault && (await this.branches.count({ where: { companyId: row.companyId } })) > 1) {
      throw new BadRequestException('Make another branch the default before deleting this one');
    }
    const holding = (await this.stockRows.find({ where: { branchId: id } })).filter((s) => s.quantity !== 0).length;
    if (holding) throw new BadRequestException(`This branch holds stock of ${holding} item(s). Move it to another branch first.`);
    if (await this.movements.count({ where: { branchId: id } })) {
      throw new BadRequestException('This branch has stock history, so it cannot be deleted. Mark it inactive instead.');
    }
    await this.stockRows.delete({ branchId: id });
    await this.branches.remove(row);
    await this.audit.log({ actorId: user.id, action: 'BRANCH_DELETED', resourceType: 'branch', resourceId: id, details: { code: row.code } });
  }

  // ── team ──
  async listTeam(user: AuthUser) {
    const rows = await this.users.find({ where: { companyId: this.companyId(user) }, order: { name: 'ASC' } });
    return rows.map(stripSecrets);
  }

  async teamRoles() {
    return (await this.rolePermissions.roleList()).filter((r) => !NOT_FOR_TEAM.has(r.key));
  }

  private async ownMember(id: number, user: AuthUser): Promise<User> {
    const member = await this.users.findOne({ where: { id, companyId: this.companyId(user) } });
    if (!member) throw new NotFoundException('Team member not found');
    if (NOT_FOR_TEAM.has(member.role)) throw new ForbiddenException('Administrators and auditors are managed by an administrator');
    return member;
  }

  private assertTeamRole(role: string | undefined) {
    if (role && NOT_FOR_TEAM.has(role)) throw new BadRequestException('That role can only be given by an administrator');
  }

  async addMember(dto: CreateUserDto, user: AuthUser) {
    this.assertTeamRole(dto.role);
    // the new person always joins the signed-in user's own company
    const created = await this.usersService.create({ ...dto, companyId: this.companyId(user) }, user.id);
    return stripSecrets(created);
  }

  async updateMember(id: number, dto: UpdateUserDto, user: AuthUser) {
    const member = await this.ownMember(id, user);
    this.assertTeamRole(dto.role);
    const updated = await this.usersService.update(member.id, { ...dto, companyId: member.companyId ?? undefined }, user.id);
    return stripSecrets(updated);
  }

  async memberAccess(id: number, user: AuthUser) {
    await this.ownMember(id, user);
    return this.rolePermissions.userAccess(id);
  }

  async setMemberAccess(id: number, dto: SetTeamAccessDto, user: AuthUser) {
    await this.ownMember(id, user);
    return this.rolePermissions.setUserAccess(id, dto, user.id);
  }
}
