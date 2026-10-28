import { Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationQueryDto, NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List my notifications' })
  findAll(@Query() query: NotificationQueryDto, @Request() req) {
    return this.notificationsService.findAll(query, req.user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications' })
  async unreadCount(@Request() req) {
    return { data: { unread: await this.notificationsService.unreadCount(req.user.id) } };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  async readAll(@Request() req) {
    return { data: { updated: await this.notificationsService.markAllRead(req.user.id) } };
  }

  @Delete('read')
  @ApiOperation({ summary: 'Delete all my read notifications' })
  async clearRead(@Request() req) {
    return { data: { deleted: await this.notificationsService.removeRead(req.user.id) } };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  async markRead(@Param('id') id: string, @Request() req) {
    return { data: await this.notificationsService.markRead(id, req.user.id) };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one notification' })
  async remove(@Param('id') id: string, @Request() req) {
    await this.notificationsService.remove(id, req.user.id);
    return { data: { deleted: 1 } };
  }
}
