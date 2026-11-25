import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClaimsService } from './claims.service';
import { ClaimQueryDto, CreateClaimDto } from './claims.dto';

@ApiTags('claims')
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claims: ClaimsService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: CreateClaimDto, @Req() req) {
    return { data: await this.claims.create(req.user.id, body) };
  }

  @Post(':id/retry')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async retry(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return { data: await this.claims.retry(req.user.id, id) };
  }

  @Post(':id/refresh')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async refreshStatus(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return { data: await this.claims.refreshStatus(req.user.id, id) };
  }

  @Get()
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async list(@Query() query: ClaimQueryDto, @Req() req) {
    return { data: await this.claims.list(req.user.id, query) };
  }

  @Get('wallet')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  async wallet(@Req() req) {
    return { data: await this.claims.wallet(req.user.id) };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    return this.claims.webhook(req.rawBody, signature);
  }
}
