import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { EmailOtpService } from './email-otp.service';

@Controller('email-otp')
export class EmailOtpController {
  constructor(private readonly emailOtpService: EmailOtpService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() data: SendEmailOtpDto) {
    await this.emailOtpService.sendOtp(data.email);
    return { message: 'Verification code sent' };
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() data: VerifyEmailOtpDto) {
    await this.emailOtpService.verifyOtp(data.email, data.otp);
    return { message: 'Email verified successfully' };
  }
}
