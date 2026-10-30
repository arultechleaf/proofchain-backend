import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { User, UserRole } from '../users/user.entity';
import { Company, CompanyType } from '../companies/company.entity';
import { AuditService } from '../audit/audit.service';
import { EmailOtpService } from '../email-otp/email-otp.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { UserProfileFields, dobProblem, profileValues } from '../users/user-profile.dto';

export interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  companyId: number | null;
  name: string;
  /** Must change password: the account may only use the change-password endpoint until it does. */
  mcp?: boolean;
}

/** account_type tag that keeps password-reset OTPs apart from sign-up ones. */
const RESET_OTP_TYPE = 'password-reset';
const BCRYPT_ROUNDS = 10;

/** Role a self-registered user gets, based on the type of the organization they join. */
const ROLE_FOR_COMPANY_TYPE: Record<CompanyType, UserRole> = {
  [CompanyType.SENDER]: UserRole.COMPANY_A,
  [CompanyType.RECEIVER]: UserRole.COMPANY_B,
  [CompanyType.AUDITOR]: UserRole.AUDITOR,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly audit: AuditService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly emailOtpService: EmailOtpService,
    private readonly rolePermissions: RolePermissionsService,
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
    // A temporary password stops working after its expiry time.
    if (user.mustChangePassword && user.passwordExpiryAt && user.passwordExpiryAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Your temporary password has expired. Ask an administrator to issue a new one.');
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
      mcp: user.mustChangePassword || undefined,
    };
    const accessToken = this.jwtService.sign(payload);
    const { passwordHash: _, resetTokenHash: _r, resetTokenExpires: _e, ...safeUser } = user;
    return { accessToken, user: safeUser };
  }

  async getMe(userId: number): Promise<Partial<User>> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    const { passwordHash: _, resetTokenHash: _r, resetTokenExpires: _e, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Self-service sign-up requires a verified email. The account remains inactive until
   * an administrator activates it, so registration never grants access on its own.
   */
  async register(dto: { name?: string; email: string; password: string; organizationCode: string } & UserProfileFields) {
    const email = dto.email.trim().toLowerCase();
    if (await this.userRepo.findOne({ where: { email } })) {
      throw new ConflictException('An account with this email already exists');
    }
    const profile = profileValues(dto);
    const firstName = profile.firstName ?? (dto.name ? dto.name.trim().split(/\s+/)[0] : null);
    const lastName = profile.lastName ?? (dto.name && dto.name.trim().includes(' ') ? dto.name.trim().split(/\s+/).slice(1).join(' ') : null);
    if (!firstName) throw new BadRequestException('Enter your first name');
    if (!profile.mobile) throw new BadRequestException('Enter your mobile number');
    const dobError = dobProblem(profile.dateOfBirth);
    if (dobError) throw new BadRequestException(dobError);
    await this.usersService.assertMobilesFree(profile.mobile, profile.alternateMobile);
    const company = await this.companyRepo.findOne({
      where: { organizationCode: dto.organizationCode.trim().toUpperCase(), isActive: true },
    });
    if (!company) throw new BadRequestException('Organization code not found');
    await this.emailOtpService.assertEmailVerified(email);

    const user = await this.userRepo.save(
      this.userRepo.create({
        ...(profile as Partial<User>),
        name: [firstName, lastName].filter(Boolean).join(' '),
        firstName,
        lastName,
        email,
        userCode: await this.usersService.nextUserCode(),
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        roleId: (await this.rolePermissions.roleIdOf(ROLE_FOR_COMPANY_TYPE[company.organizationType]))!,
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
   * Step 1 of password reset: if the email belongs to an active user in the users table,
   * email a 6-digit OTP. The reply is identical whether or not the email exists.
   */
  async forgotPassword(emailInput: string) {
    const message = 'If that email is registered, a verification code has been sent.';
    const email = emailInput.trim().toLowerCase();
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !user.isActive) return { message };

    try {
      await this.emailOtpService.sendOtp(email, RESET_OTP_TYPE);
    } catch (err) {
      // A repeat request inside the resend window is not an error: the earlier code still works.
      if (!(err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS)) {
        this.logger.error(`Could not email password reset code to ${email}: ${(err as Error).message}`);
      }
    }
    await this.audit.log({
      actorId: user.id, action: 'PASSWORD_RESET_REQUESTED', resourceType: 'user', resourceId: user.id,
    });
    return { message };
  }

  /** Step 2: check the OTP the user typed. */
  async verifyResetOtp(emailInput: string, otp: string) {
    await this.emailOtpService.verifyOtp(emailInput.trim().toLowerCase(), otp, RESET_OTP_TYPE);
    return { message: 'Code verified. Choose a new password.' };
  }

  /** Step 3: with a verified OTP, store the new password hash in the users table. */
  async resetPassword(emailInput: string, newPassword: string) {
    const email = emailInput.trim().toLowerCase();
    await this.emailOtpService.assertEmailVerified(email, RESET_OTP_TYPE);
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user || !user.isActive) {
      throw new BadRequestException('This account cannot be reset');
    }
    await this.userRepo.update(user.id, {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      mustChangePassword: false,
      passwordExpiryAt: null,
      resetTokenHash: null,
      resetTokenExpires: null,
    });
    await this.emailOtpService.consumeVerifiedOtp(email, RESET_OTP_TYPE);
    await this.audit.log({
      actorId: user.id, action: 'PASSWORD_RESET', resourceType: 'user', resourceId: user.id,
    });
    return { message: 'Password updated. You can now sign in.' };
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('Choose a new password that is different from the current one');
    }
    // Only the password and its temporary-password flags change (updated_at is refreshed automatically).
    await this.userRepo.update(userId, {
      passwordHash: await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
      mustChangePassword: false,
      passwordExpiryAt: null,
    });
    await this.audit.log({
      actorId: userId, action: 'PASSWORD_CHANGED', resourceType: 'user', resourceId: userId,
    });
    // A fresh token, because the old one still carries the "must change password" flag.
    const fresh = (await this.usersService.findById(userId))!;
    return { message: 'Password changed', ...(await this.login(fresh)) };
  }

  async updateProfile(userId: number, name: string) {
    await this.userRepo.update(userId, { name: name.trim() });
    return this.getMe(userId);
  }
}
