import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength,
} from 'class-validator';
import { User, UserRole } from './user.entity';
import { Company } from '../companies/company.entity';
import { AuditService } from '../audit/audit.service';

const BCRYPT_ROUNDS = 10;

export class CreateUserDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8) @MaxLength(100)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional() @IsUUID()
  companyId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional() @IsUUID()
  companyId?: string;

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
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly audit: AuditService,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email }, relations: { company: true } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id }, relations: { company: true } });
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.find({
      relations: { company: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findByCompany(companyId: string): Promise<User[]> {
    return this.userRepo.find({
      where: { companyId },
      relations: { company: true },
    });
  }

  async create(dto: CreateUserDto, actorId: string): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepo.findOne({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    await this.assertCompany(dto.companyId, dto.role);

    const user = await this.userRepo.save(
      this.userRepo.create({
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: dto.role,
        companyId: dto.companyId ?? (null as any),
        isActive: true,
      }),
    );
    await this.audit.log({
      actorId, action: 'USER_CREATED', resourceType: 'user', resourceId: user.id,
      details: { email, role: dto.role },
    });
    return (await this.findById(user.id))!;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    if (id === actorId && (dto.isActive === false || (dto.role && dto.role !== user.role))) {
      throw new BadRequestException('You cannot deactivate or change the role of your own account');
    }
    const role = dto.role ?? user.role;
    const companyId = dto.companyId ?? user.companyId;
    await this.assertCompany(companyId ?? undefined, role);

    if (dto.name !== undefined) user.name = dto.name.trim();
    user.role = role;
    user.companyId = companyId;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // `company` is a loaded relation; clear it so the new companyId is what gets saved.
    delete (user as any).company;
    await this.userRepo.save(user);
    await this.audit.log({
      actorId, action: 'USER_UPDATED', resourceType: 'user', resourceId: id,
      details: { role, isActive: user.isActive, passwordReset: !!dto.password },
    });
    return (await this.findById(id))!;
  }

  /** Non-admin roles must belong to an existing organization. */
  private async assertCompany(companyId: string | undefined, role: UserRole): Promise<void> {
    if (companyId) {
      if (!(await this.companyRepo.findOne({ where: { id: companyId } }))) {
        throw new BadRequestException('Organization not found');
      }
    } else if (role !== UserRole.ADMIN) {
      throw new BadRequestException('This role must belong to an organization');
    }
  }
}
