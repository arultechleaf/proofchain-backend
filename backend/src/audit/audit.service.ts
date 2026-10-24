import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

export interface AuditLogInput {
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(input: AuditLogInput): Promise<AuditLog> {
    const entry = this.auditRepo.create({
      actorId: input.actorId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
    });
    return this.auditRepo.save(entry);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    resourceType?: string;
    actorId?: string;
  }): Promise<{ data: AuditLog[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 50, 200);
    const qb = this.auditRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.actor', 'actor')
      .orderBy('a.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (options?.resourceType) {
      qb.andWhere('a.resourceType = :rt', { rt: options.resourceType });
    }
    if (options?.actorId) {
      qb.andWhere('a.actorId = :aid', { aid: options.actorId });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async exportCsv(): Promise<string> {
    const logs = await this.auditRepo.find({
      order: { createdAt: 'DESC' },
      take: 10000,
    });

    const header = 'id,actorId,action,resourceType,resourceId,details,createdAt\n';
    const rows = logs.map((l) =>
      [
        l.id,
        l.actorId ?? '',
        l.action,
        l.resourceType,
        l.resourceId ?? '',
        JSON.stringify(l.details ?? {}).replace(/,/g, ';'),
        l.createdAt.toISOString(),
      ].join(','),
    );
    return header + rows.join('\n');
  }
}
