import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8) @MaxLength(100)
  password: string;

  @IsString() @MaxLength(50)
  organizationCode: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(20) @MaxLength(200)
  token: string;

  @IsString() @MinLength(8) @MaxLength(100)
  password: string;
}

export class ChangePasswordDto {
  @IsString() @MaxLength(100)
  currentPassword: string;

  @IsString() @MinLength(8) @MaxLength(100)
  newPassword: string;
}

export class UpdateProfileDto {
  @IsString() @MinLength(2) @MaxLength(100)
  name: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() body: LoginDto) {
    const user = await this.authService.validateUser(body.email, body.password);
    return this.authService.login(user);
  }

  @Post('register')
  @ApiOperation({ summary: 'Request an account (inactive until an administrator approves it)' })
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset token' })
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.authService.forgotPassword(body.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  async resetPassword(@Body() body: ResetPasswordDto) {
    return this.authService.resetPassword(body.token, body.password);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout (client should discard token)' })
  logout() {
    return { message: 'Logged out successfully' };
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user' })
  async getMe(@Request() req) {
    return this.authService.getMe(req.user.id);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update your display name' })
  async updateMe(@Body() body: UpdateProfileDto, @Request() req) {
    return this.authService.updateProfile(req.user.id, body.name);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change your password' })
  async changePassword(@Body() body: ChangePasswordDto, @Request() req) {
    return this.authService.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }
}
