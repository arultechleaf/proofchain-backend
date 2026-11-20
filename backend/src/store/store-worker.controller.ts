import {
  BadRequestException, Body, Controller, Get, Injectable, NotFoundException, Param, ParseIntPipe, Patch, Post, Query, Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { In, IsNull } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OrderStatus, STORE_ROLES } from './store.entities';
import { StoreCoreService, StoreUser, round2 } from './store-core.service';

export class WorkerStatusDto {
  @IsIn(['packing', 'ready', 'out_for_delivery', 'delivered']) status: OrderStatus;
  @IsOptional() @Matches(/^\d{4}$/, { message: 'The delivery code is 4 digits' }) code?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

@Injectable()
export class StoreWorkerService {
  constructor(private readonly core: StoreCoreService) {}

  async dashboard(user: StoreUser) {
    const shop = await this.core.shopOf(user);
    const [open, mine, done] = await Promise.all([
      this.core.orders.count({ where: { shopId: shop.id, status: In(['accepted', 'packing', 'ready']), assignedWorkerId: IsNull() } }),
      this.core.orders.count({ where: { shopId: shop.id, assignedWorkerId: user.id, status: In(['accepted', 'packing', 'ready', 'out_for_delivery']) } }),
      this.core.orders.find({ where: { shopId: shop.id, assignedWorkerId: user.id, status: 'delivered' } }),
    ]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const deliveredToday = done.filter((o) => o.deliveredAt && o.deliveredAt >= today);
    return {
      shop: { id: shop.id, name: shop.name },
      waiting: open, assignedToMe: mine,
      deliveredToday: deliveredToday.length,
      deliveredTotal: done.length,
      cashCollectedToday: round2(deliveredToday.filter((o) => o.paymentMethod === 'cod').reduce((n, o) => n + o.total, 0)),
    };
  }

  /** Orders the worker can work on: theirs, plus the shop's accepted orders nobody has taken yet. */
  async assigned(user: StoreUser, scope: 'mine' | 'open') {
    const shop = await this.core.shopOf(user);
    const rows = scope === 'open'
      ? await this.core.orders.find({
        where: { shopId: shop.id, status: In(['accepted', 'packing', 'ready']), assignedWorkerId: IsNull() }, order: { id: 'ASC' },
      })
      : await this.core.orders.find({
        where: { shopId: shop.id, assignedWorkerId: user.id, status: In(['accepted', 'packing', 'ready', 'out_for_delivery']) }, order: { id: 'ASC' },
      });
    return this.core.withItems(rows);
  }

  async history(user: StoreUser) {
    const shop = await this.core.shopOf(user);
    const rows = await this.core.orders.find({
      where: { shopId: shop.id, assignedWorkerId: user.id, status: In(['delivered', 'cancelled']) }, order: { id: 'DESC' }, take: 100,
    });
    return this.core.withItems(rows);
  }

  async get(user: StoreUser, id: number) {
    const shop = await this.core.shopOf(user);
    const o = await this.core.orders.findOne({ where: { id, shopId: shop.id } });
    if (!o) throw new NotFoundException('Order not found');
    if (o.assignedWorkerId && o.assignedWorkerId !== user.id) throw new NotFoundException('Order not found');
    const view = await this.core.view(o);
    // the delivery code is for the customer to say out loud: never shown to the worker
    return { ...view, deliveryCode: undefined };
  }

  /** Take an unassigned order. */
  async claim(user: StoreUser, id: number) {
    const shop = await this.core.shopOf(user);
    const res = await this.core.orders.createQueryBuilder().update()
      .set({ assignedWorkerId: user.id })
      .where('id = :id AND shop_id = :shop AND assigned_worker_id IS NULL AND status IN (:...st)', { id, shop: shop.id, st: ['accepted', 'packing', 'ready'] })
      .execute();
    if (!res.affected) throw new BadRequestException('This order is already taken or finished');
    const o = await this.core.orders.findOneOrFail({ where: { id } });
    await this.core.addEvent(id, o.status, user.id, 'Taken by a worker');
    return this.get(user, id);
  }

  async setStatus(user: StoreUser, id: number, dto: WorkerStatusDto) {
    const o = await this.core.orders.findOne({ where: { id } });
    // a worker moving an unassigned order takes it
    if (o && !o.assignedWorkerId && o.status !== 'placed') await this.claim(user, id);
    await this.core.transition(id, dto.status, user, { code: dto.code, reason: dto.reason });
    return this.get(user, id);
  }
}

@ApiTags('store-worker')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(STORE_ROLES.WORKER)
@Controller('store/worker')
export class StoreWorkerController {
  constructor(private readonly s: StoreWorkerService) {}

  @Get('dashboard') dashboard(@Request() req) { return this.s.dashboard(req.user); }
  @Get('orders') @ApiOperation({ summary: 'scope=mine (default) or scope=open' })
  orders(@Query('scope') scope: string | undefined, @Request() req) { return this.s.assigned(req.user, scope === 'open' ? 'open' : 'mine'); }
  @Get('history') history(@Request() req) { return this.s.history(req.user); }
  @Get('orders/:id') order(@Param('id', ParseIntPipe) id: number, @Request() req) { return this.s.get(req.user, id); }
  @Post('orders/:id/claim') claim(@Param('id', ParseIntPipe) id: number, @Request() req) { return this.s.claim(req.user, id); }
  @Patch('orders/:id/status') status(@Param('id', ParseIntPipe) id: number, @Body() b: WorkerStatusDto, @Request() req) {
    return this.s.setStatus(req.user, id, b);
  }
}
