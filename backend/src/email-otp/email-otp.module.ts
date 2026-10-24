import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailOtpController } from './email-otp.controller';
import { EmailOtp } from './email-otp.entity';
import { EmailOtpService } from './email-otp.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailOtp])],
  controllers: [EmailOtpController],
  providers: [EmailOtpService],
  exports: [EmailOtpService],
})
export class EmailOtpModule {}
