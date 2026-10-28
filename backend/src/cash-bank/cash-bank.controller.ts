import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  BankTransactionQueryDto, CashBankService, CreateAccountDto, CreateBankTransactionDto, TransferDto, UpdateAccountDto,
} from './cash-bank.service';

@ApiTags('cash-bank')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('cash-bank')
export class CashBankController {
  constructor(private readonly service: CashBankService) {}

  @Get('accounts')
  @ApiOperation({ summary: 'Cash and bank accounts with balances' })
  async accounts(@Request() req) {
    return { data: await this.service.listAccounts(req.user) };
  }

  @Post('accounts')
  @ApiOperation({ summary: 'Create a cash or bank account' })
  async createAccount(@Body() body: CreateAccountDto, @Request() req) {
    return { data: await this.service.createAccount(body, req.user) };
  }

  @Patch('accounts/:id')
  @ApiOperation({ summary: 'Rename, deactivate or edit an account' })
  async updateAccount(@Param('id') id: string, @Body() body: UpdateAccountDto, @Request() req) {
    return { data: await this.service.updateAccount(id, body, req.user) };
  }

  @Delete('accounts/:id')
  @ApiOperation({ summary: 'Delete an account that has no transactions' })
  async removeAccount(@Param('id') id: string, @Request() req) {
    await this.service.removeAccount(id, req.user);
    return { data: { deleted: 1 } };
  }

  @Delete('transactions/:id')
  @ApiOperation({ summary: 'Delete a deposit, withdrawal or transfer' })
  async removeTransaction(@Param('id') id: string, @Request() req) {
    await this.service.removeTransaction(id, req.user);
    return { data: { deleted: 1 } };
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Deposits, withdrawals and transfers' })
  transactions(@Query() query: BankTransactionQueryDto, @Request() req) {
    return this.service.listTransactions(query, req.user);
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Record a deposit or withdrawal' })
  async createTransaction(@Body() body: CreateBankTransactionDto, @Request() req) {
    return { data: await this.service.createTransaction(body, req.user) };
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer money between two accounts' })
  async transfer(@Body() body: TransferDto, @Request() req) {
    return { data: await this.service.transfer(body, req.user) };
  }
}
