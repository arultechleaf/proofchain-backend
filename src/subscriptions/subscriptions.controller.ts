import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SubscriptionsService } from './subscriptions.service';
import {
  AssignSubscriptionDto, CreatePlanDto, CreateSubscriptionOrderDto, SubscriptionQueryDto, UpdatePlanDto,
  VerifySubscriptionPaymentDto,
} from './subscriptions.dto';

/** Plans: anyone signed in can see the ones on sale; only administrators can add, change or delete them. */
@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscription-plans')
export class SubscriptionPlansController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Plans on sale (latest prices)' })
  async active() {
    return { data: await this.service.listActivePlans() };
  }

  @Get('all')
  @Roles('admin')
  @ApiOperation({ summary: 'Every plan, hidden ones included (admin)' })
  async all() {
    return { data: await this.service.listAllPlans() };
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Add a plan (admin)' })
  async create(@Body() body: CreatePlanDto, @Req() req) {
    return { data: await this.service.createPlan(body, req.user.id) };
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Change a plan; price or discount changes are kept in the price history (admin)' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdatePlanDto, @Req() req) {
    return { data: await this.service.updatePlan(id, body, req.user.id) };
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Delete a plan; a plan with subscribers is hidden instead (admin)' })
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return { data: await this.service.removePlan(id, req.user.id) };
  }

  @Get(':id/history')
  @Roles('admin')
  @ApiOperation({ summary: 'Price history of a plan (admin)' })
  async history(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.priceHistory(id) };
  }
}

@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get('me')
  @ApiOperation({ summary: 'My subscription: status, end date, history' })
  async me(@Req() req) {
    return { data: await this.service.mySubscription(req.user.id) };
  }

  @Post('order')
  @ApiOperation({ summary: 'Start buying a plan: creates a Razorpay order at the current price' })
  async order(@Body() body: CreateSubscriptionOrderDto, @Req() req) {
    return { data: await this.service.createOrder(body.planId, req.user) };
  }

  @Post('verify')
  @ApiOperation({ summary: 'Confirm the Razorpay payment and start the subscription' })
  async verify(@Body() body: VerifySubscriptionPaymentDto, @Req() req) {
    return { data: await this.service.verifyPayment(body, req.user) };
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'All user subscriptions (admin)' })
  async list(@Query() query: SubscriptionQueryDto) {
    return this.service.listSubscriptions(query);
  }

  @Post('assign')
  @Roles('admin')
  @ApiOperation({ summary: 'Give a user a plan paid offline (admin)' })
  async assign(@Body() body: AssignSubscriptionDto, @Req() req) {
    return { data: await this.service.assign(body, req.user.id) };
  }

  @Patch(':id/cancel')
  @Roles('admin')
  @ApiOperation({ summary: 'Cancel a subscription (admin)' })
  async cancel(@Param('id', ParseIntPipe) id: number, @Req() req) {
    return { data: await this.service.cancel(id, req.user.id) };
  }

  @Post('run-checks')
  @Roles('admin')
  @ApiOperation({ summary: 'Send due reminders and expire ended subscriptions now (runs hourly by itself) (admin)' })
  async runChecks() {
    return { data: await this.service.runChecks() };
  }
}
