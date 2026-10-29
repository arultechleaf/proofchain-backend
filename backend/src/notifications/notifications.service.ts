import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Notification, NotificationType } from './notification.entity';
import { User, UserRole } from '../users/user.entity';

export class NotificationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  unread?: boolean;
}

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Notify every active user of a company, plus all admins. Never throws: a failed notification
   * must not break the delivery, invoice or payment that triggered it.
   */
  async notifyCompany(companyId: number | null | undefined, input: NotifyInput, excludeUserId?: number): Promise<void> {
    try {
      const recipients = await this.userRepo.find({
        where: [
          ...(companyId ? [{ companyId, isActive: true }] : []),
          { roleRef: { key: UserRole.ADMIN }, isActive: true },
        ],
        select: { id: true },
      });
      const ids = [...new Set(recipients.map((u) => u.id))].filter((id) => id !== excludeUserId);
      if (!ids.length) return;
      await this.repo.save(
        ids.map((userId) => this.repo.create({ userId, type: input.type, title: input.title, message: input.message, link: input.link ?? null })),
      );
    } catch (err) {
      this.logger.warn(`Could not create notification: ${(err as Error).message}`);
    }
  }

  async findAll(query: NotificationQueryDto, userId: number) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (query.unread) qb.andWhere('n.isRead = :read', { read: false });
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, unread: await this.unreadCount(userId) };
  }

  unreadCount(userId: number): Promise<number> {
    return this.repo.count({ where: { userId, isRead: false } });
  }

  async markRead(id: number, userId: number): Promise<Notification> {
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    n.isRead = true;
    return this.repo.save(n);
  }

  async markAllRead(userId: number): Promise<number> {
    const res = await this.repo.update({ userId, isRead: false }, { isRead: true });
    return res.affected ?? 0;
  }

  async remove(id: number, userId: number): Promise<void> {
    const res = await this.repo.delete({ id, userId });
    if (!res.affected) throw new NotFoundException('Notification not found');
  }

  async removeRead(userId: number): Promise<number> {
    const res = await this.repo.delete({ userId, isRead: true });
    return res.affected ?? 0;
  }
}
