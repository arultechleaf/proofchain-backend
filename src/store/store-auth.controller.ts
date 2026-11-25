import { BadRequestException, Body, ConflictException, Controller, Injectable, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { EmailOtpService } from '../email-otp/email-otp.service';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { MOBILE_PATTERN, PINCODE_PATTERN } from '../users/user-profile.dto';
import { STORE_ROLES, StoreShop } from './store.entities';

class RegisterBase {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @Matches(MOBILE_PATTERN, { message: 'Enter a valid 10-digit mobile number' })
  mobile: string;

  @IsString() @MinLength(8) @MaxLength(100)
  password: string;
}

export class RegisterCustomerDto extends RegisterBase {}

export class RegisterOwnerDto extends RegisterBase {
  @IsString() @MinLength(2) @MaxLength(120)
  shopName: string;

  @IsOptional() @IsString() @MaxLength(300)
  shopAddress?: string;

  @IsOptional() @IsString() @MaxLength(80)
  city?: string;

  @IsOptional() @IsString() @Matches(PINCODE_PATTERN, { message: 'Pincode must be 6 digits' })
  pincode?: string;
}

@Injectable()
export class StoreAuthService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersService: UsersService,
    private readonly emailOtp: EmailOtpService,
    private readonly roles: RolePermissionsService,
  ) {}

  /** Create the user row for a store account (active at once: the email was verified with a code). */
  private async createUser(dto: RegisterBase, roleKey: string): Promise<User> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findOne({ where: { email } })) throw new ConflictException('An account with this email already exists');
    await this.usersService.assertMobilesFree(dto.mobile, undefined);
    await this.emailOtp.assertEmailVerified(email);
    const roleId = await this.roles.roleIdOf(roleKey);
    if (!roleId) throw new BadRequestException('Store roles are not set up yet. Restart the server once.');
    const [first, ...rest] = dto.name.trim().split(/\s+/);
    const user = await this.users.save(
      this.users.create({
        name: dto.name.trim(),
        firstName: first,
        lastName: rest.join(' ') || null,
        email,
        mobile: dto.mobile,
        userCode: await this.usersService.nextUserCode(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        roleId,
        companyId: null,
        isActive: true,
        mustChangePassword: false,
      }),
    );
    await this.emailOtp.consumeVerifiedOtp(email);
    return user;
  }

  async registerCustomer(dto: RegisterCustomerDto) {
    await this.createUser(dto, STORE_ROLES.CUSTOMER);
    return { message: 'Account created. You can sign in now.' };
  }

  async registerOwner(dto: RegisterOwnerDto) {
    const user = await this.createUser(dto, STORE_ROLES.OWNER);
    await this.ds.getRepository(StoreShop).save(
      this.ds.getRepository(StoreShop).create({
        ownerId: user.id,
        name: dto.shopName.trim(),
        address: dto.shopAddress?.trim() || null,
        city: dto.city?.trim() || null,
        pincode: dto.pincode || null,
        phone: dto.mobile,
      }),
    );
    return { message: 'Shop created. You can sign in now.' };
  }
}

@ApiTags('store-auth')
@Controller('store/auth')
export class StoreAuthController {
  constructor(private readonly service: StoreAuthService) {}

  @Post('register-customer')
  @ApiOperation({ summary: 'Customer sign-up (verify the email code with /email-otp first)' })
  registerCustomer(@Body() body: RegisterCustomerDto) {
    return this.service.registerCustomer(body);
  }

  @Post('register-owner')
  @ApiOperation({ summary: 'Shop-owner sign-up: creates the account and the shop' })
  registerOwner(@Body() body: RegisterOwnerDto) {
    return this.service.registerOwner(body);
  }
}
