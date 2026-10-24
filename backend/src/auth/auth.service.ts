import {
  BadRequestException, ConflictException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { Company, CompanyType } from '../companies/company.entity';
import { AuditService } from '../audit/audit.service';
import { EmailOtpService } from '../email-otp/email-otp.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  companyId: string | null;
  name: string;
}

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

/** Role a self-registered user gets, based on the type of the organization they join. */
const ROLE_FOR_COMPANY_TYPE: Record<CompanyType, UserRole> = {
  [CompanyType.SENDER]: UserRole.COMPANY_A,
  [CompanyType.RECEIVER]: UserRole.COMPANY_B,
  [CompanyType.AUDITOR]: UserRole.AUDITOR,
};

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly emailOtpService: EmailOtpService,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email.trim().toLowerCase());
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(user: User): Promise<{ accessToken: string; user: Partial<User> }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId ?? null,
      name: user.name,
    };
    const accessToken = this.jwtService.sign(payload);
    const { passwordHash: _, resetTokenHash: _r, resetTokenExpires: _e, ...safeUser } = user;
    return { accessToken, user: safeUser };
  }

  async getMe(userId: string): Promise<Partial<User>> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    const { passwordHash: _, resetTokenHash: _r, resetTokenExpires: _e, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Self-service sign-up requires a verified email. The account remains inactive until
   * an administrator activates it, so registration never grants access on its own.
   */
  async register(dto: { name: string; email: string; password: string; organizationCode: string }) {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepo.findOne({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const company = await this.companyRepo.findOne({
      where: { organizationCode: dto.organizationCode.trim().toUpperCase(), isActive: true },
    });
    if (!company) throw new BadRequestException('Organization code not found');
    await this.emailOtpService.assertEmailVerified(email);

    const user = await this.userRepo.save(
      this.userRepo.create({
        name: dto.name.trim(),
        email,
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        role: ROLE_FOR_COMPANY_TYPE[company.organizationType],
        companyId: company.id,
        isActive: false,
      }),
    );
    await this.emailOtpService.consumeVerifiedOtp(email);
    await this.audit.log({
      actorId: user.id, action: 'USER_REGISTERED', resourceType: 'user', resourceId: user.id,
      details: { email, organization: company.organizationCode },
    });
    return { message: 'Registration received. An administrator must activate your account before you can sign in.' };
  }

  /**
   * Issue a one-time reset token. There is no email service yet, so outside production the
   * token is returned in the response. The reply is identical whether or not the email exists.
   */
  async forgotPassword(emailInput: string) {
    const message = 'If that email is registered, a reset link has been generated.';
    const user = await this.userRepo.findOne({ where: { email: emailInput.trim().toLowerCase() } });
    if (!user || !user.isActive) return { message };

    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha256(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    await this.userRepo.update(user.id, {
      resetTokenHash: user.resetTokenHash,
      resetTokenExpires: user.resetTokenExpires,
    });
    await this.audit.log({
      actorId: user.id, action: 'PASSWORD_RESET_REQUESTED', resourceType: 'user', resourceId: user.id,
    });

    return process.env.NODE_ENV === 'production' ? { message } : { message, resetToken: token };
  }

  async resetPassword(token: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { resetTokenHash: sha256(token) } });
    if (!user || !user.resetTokenExpires || new Date(user.resetTokenExpires).getTime() < Date.now()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }
    await this.userRepo.update(user.id, {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      resetTokenHash: null,
      resetTokenExpires: null,
    });
    await this.audit.log({
      actorId: user.id, action: 'PASSWORD_RESET', resourceType: 'user', resourceId: user.id,
    });
    return { message: 'Password updated. You can now sign in.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.userRepo.update(userId, { passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
    await this.audit.log({
      actorId: userId, action: 'PASSWORD_CHANGED', resourceType: 'user', resourceId: userId,
    });
    return { message: 'Password changed' };
  }

  async updateProfile(userId: string, name: string) {
    await this.userRepo.update(userId, { name: name.trim() });
    return this.getMe(userId);
  }
}
