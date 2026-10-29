import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, IsInt,
} from 'class-validator';
import { User, UserRole } from './user.entity';
import { Company } from '../companies/company.entity';
import { AuditService } from '../audit/audit.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { UserProfileFields, dobProblem, profileValues } from './user-profile.dto';
import { Type } from 'class-transformer';

const BCRYPT_ROUNDS = 10;
/** How long a temporary password stays usable (hours). */
const TEMP_PASSWORD_TTL_HOURS = Number(process.env.TEMP_PASSWORD_TTL_HOURS) || 72;

/** 12 random characters with upper, lower, digit and symbol; never logged or stored in plain text. */
export function generateTemporaryPassword(): string {
  const pick = (chars: string) => chars[crypto.randomInt(chars.length)];
  const all = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  const chars = [pick('ABCDEFGHJKLMNPQRSTUVWXYZ'), pick('abcdefghijkmnpqrstuvwxyz'), pick('23456789'), pick('!@#$%')];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export class CreateUserDto extends UserProfileFields {
  /** Full name; optional when firstName is given. */
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsEmail()
  email: string;

  /** Leave out to generate a temporary password. Either way it is temporary: the user must change it at first sign-in. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100)
  password?: string;

  /** Key of a role from the roles table. */
  @IsString() @MaxLength(30)
  role: UserRole;

  @IsOptional() @Type(() => Number) @IsInt()
  companyId?: number;
}

export class UpdateUserDto extends UserProfileFields {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(30)
  role?: UserRole;

  @IsOptional() @Type(() => Number) @IsInt()
  companyId?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  /** Admin-set replacement password. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100)
  password?: string;
}

export const stripSecrets = (u: User) => {
  const { passwordHash: _p, resetTokenHash: _r, resetTokenExpires: _e, ...safe } = u;
  return safe;
};

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly audit: AuditService,
    private readonly rolePermissions: RolePermissionsService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email }, relations: { company: true } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id }, relations: { company: true } });
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.find({
      relations: { company: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findByCompany(companyId: number): Promise<User[]> {
    return this.userRepo.find({
      where: { companyId },
      relations: { company: true },
    });
  }

  /** Give every existing account without a user code one (USR-0001, USR-0002, ...), oldest first. */
  async onModuleInit() {
    try {
      const missing = await this.userRepo.find({ where: { userCode: IsNull() }, order: { createdAt: 'ASC' } });
      for (const u of missing) {
        await this.userRepo.update(u.id, { userCode: await this.nextUserCode() });
      }
      if (missing.length) this.logger.log(`Assigned user codes to ${missing.length} existing account(s)`);
    } catch (err) {
      this.logger.error(`Could not assign user codes: ${(err as Error).message}`);
    }
  }

  /** Next free code: one more than the highest number in use. */
  async nextUserCode(): Promise<string> {
    const row = await this.userRepo.createQueryBuilder('u')
      .select("MAX(CAST(SUBSTRING(u.user_code, 5) AS UNSIGNED))", 'max')
      .where("u.user_code LIKE 'USR-%'")
      .getRawOne<{ max: string | null }>();
    return 'USR-' + String((Number(row?.max) || 0) + 1).padStart(4, '0');
  }

  /** Mobile numbers are unique across accounts. */
  async assertMobilesFree(mobile: string | null | undefined, alternate: string | null | undefined, exceptId?: number): Promise<void> {
    if (mobile && alternate && mobile === alternate) {
      throw new BadRequestException('The alternate mobile number must be different from the mobile number');
    }
    if (mobile) {
      const taken = await this.userRepo.findOne({ where: { mobile } });
      if (taken && taken.id !== exceptId) throw new ConflictException('This mobile number is already used by another account');
    }
  }

  /** The display name: "First Last", falling back to a plain name. */
  private displayName(first?: string | null, last?: string | null, fallback?: string | null): string {
    const full = [first, last].filter(Boolean).join(' ').trim();
    return full || (fallback ?? '').trim();
  }

  /**
   * Create an account. The password is always temporary: if none is given a random one is generated. It is stored only
   * as a hash; the plain text is returned once to the administrator and never written anywhere else.
   */
  async create(dto: CreateUserDto, actorId: number): Promise<User & { temporaryPassword: string }> {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepo.findOne({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const profile = profileValues(dto);
    const firstName = profile.firstName ?? (dto.name ? dto.name.trim().split(/\s+/)[0] : null);
    const lastName = profile.lastName ?? (dto.name && dto.name.trim().includes(' ') ? dto.name.trim().split(/\s+/).slice(1).join(' ') : null);
    const name = this.displayName(firstName, lastName, dto.name);
    if (!name) throw new BadRequestException('Enter the first name');
    const problem = dobProblem(profile.dateOfBirth);
    if (problem) throw new BadRequestException(problem);
    await this.assertMobilesFree(profile.mobile, profile.alternateMobile);
    const roleId = await this.roleIdOrFail(dto.role);
    await this.assertCompany(dto.companyId, dto.role);

    const temporaryPassword = dto.password ?? generateTemporaryPassword();
    const user = await this.userRepo.save(
      this.userRepo.create({
        ...(profile as Partial<User>),
        name,
        firstName,
        lastName,
        email,
        userCode: await this.nextUserCode(),
        passwordHash: await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS),
        mustChangePassword: true,
        passwordExpiryAt: new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600 * 1000),
        roleId,
        companyId: dto.companyId ?? (null as any),
        isActive: true,
      }),
    );
    await this.audit.log({
      actorId, action: 'USER_CREATED', resourceType: 'user', resourceId: user.id,
      details: { email, role: dto.role, userCode: user.userCode, passwordGenerated: !dto.password },
    });
    return Object.assign((await this.findById(user.id))!, { temporaryPassword });
  }

  async update(id: number, dto: UpdateUserDto, actorId: number): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    if (id === actorId && (dto.isActive === false || (dto.role && dto.role !== user.role))) {
      throw new BadRequestException('You cannot deactivate or change the role of your own account');
    }
    const role = dto.role ?? user.role;
    const roleId = dto.role && dto.role !== user.role ? await this.roleIdOrFail(dto.role) : user.roleId;
    const companyId = dto.companyId ?? user.companyId;
    await this.assertCompany(companyId ?? undefined, role);

    const profile = profileValues(dto);
    const problem = dobProblem(profile.dateOfBirth);
    if (problem) throw new BadRequestException(problem);
    await this.assertMobilesFree(
      'mobile' in profile ? profile.mobile : user.mobile,
      'alternateMobile' in profile ? profile.alternateMobile : user.alternateMobile,
      id,
    );
    Object.assign(user, profile);
    if (dto.name !== undefined) user.name = dto.name.trim();
    if ('firstName' in profile || 'lastName' in profile) {
      user.name = this.displayName(user.firstName, user.lastName, user.name);
    }
    user.roleId = roleId;
    delete (user as any).roleRef; // the stored role_id is what gets saved
    user.companyId = companyId;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) {
      // An administrator-set password is temporary: the user must replace it at the next sign-in.
      user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      user.mustChangePassword = true;
      user.passwordExpiryAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600 * 1000);
    }

    // `company` is a loaded relation; clear it so the new companyId is what gets saved.
    delete (user as any).company;
    await this.userRepo.save(user);
    await this.audit.log({
      actorId, action: 'USER_UPDATED', resourceType: 'user', resourceId: id,
      details: { role, isActive: user.isActive, passwordReset: !!dto.password },
    });
    return (await this.findById(id))!;
  }

  /** The role must exist in the roles table; returns its number (the value stored in users.role_id). */
  private async roleIdOrFail(role: string): Promise<number> {
    const id = await this.rolePermissions.roleIdOf(role);
    if (id == null) throw new BadRequestException(`Unknown role "${role}"`);
    return id;
  }

  /** Non-admin roles must belong to an existing organization. */
  private async assertCompany(companyId: number | undefined, role: UserRole): Promise<void> {
    if (companyId) {
      if (!(await this.companyRepo.findOne({ where: { id: companyId } }))) {
        throw new BadRequestException('Organization not found');
      }
    } else if (role !== UserRole.ADMIN) {
      throw new BadRequestException('This role must belong to an organization');
    }
  }
}
