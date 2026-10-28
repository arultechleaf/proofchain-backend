import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import {
  ACCESS_LEVELS, AREAS, AccessLevel, DEFAULT_LEVELS, ROLE_KEYS, RolePermission,
} from './role-permissions';
import { AuditService } from '../audit/audit.service';

export class PermissionChangeDto {
  @IsIn(ROLE_KEYS)
  role: string;

  @IsString() @IsIn(AREAS.map((a) => a.key))
  area: string;

  @IsIn(ACCESS_LEVELS)
  level: AccessLevel;
}

export class UpdatePermissionsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PermissionChangeDto)
  changes: PermissionChangeDto[];
}

@Injectable()
export class RolePermissionsService implements OnModuleInit {
  private readonly logger = new Logger(RolePermissionsService.name);

  constructor(
    @InjectRepository(RolePermission) private readonly repo: Repository<RolePermission>,
    private readonly audit: AuditService,
  ) {}

  /** Fill in any (role, area) pair that has no row yet; never overwrites an existing choice. */
  async onModuleInit() {
    try {
      const existing = new Set((await this.repo.find()).map((p) => `${p.role}|${p.area}`));
      const missing: RolePermission[] = [];
      for (const area of AREAS) {
        for (const role of ROLE_KEYS) {
          if (existing.has(`${role}|${area.key}`)) continue;
          missing.push(this.repo.create({ role, area: area.key, level: DEFAULT_LEVELS[area.key]?.[role] ?? 'none' }));
        }
      }
      if (missing.length) {
        await this.repo.save(missing);
        this.logger.log(`Seeded ${missing.length} default role permissions`);
      }
    } catch (err) {
      this.logger.error(`Could not seed role permissions: ${(err as Error).message}`);
    }
  }

  /** The matrix as the Roles page shows it. */
  async matrix() {
    const rows = await this.repo.find();
    const levels = new Map(rows.map((r) => [`${r.role}|${r.area}`, r.level]));
    return {
      roles: ROLE_KEYS,
      levels: ACCESS_LEVELS,
      rows: AREAS.map((a) => ({
        area: a.key,
        label: a.label,
        levels: Object.fromEntries(ROLE_KEYS.map((role) => [role, levels.get(`${role}|${a.key}`) ?? DEFAULT_LEVELS[a.key]?.[role] ?? 'none'])),
      })),
    };
  }

  /** Level one role has in one area; used when enforcement is wired into the API. */
  async levelFor(role: string, area: string): Promise<AccessLevel> {
    const row = await this.repo.findOne({ where: { role, area } });
    return row?.level ?? DEFAULT_LEVELS[area]?.[role] ?? 'none';
  }

  async update(dto: UpdatePermissionsDto, actorId: string) {
    for (const c of dto.changes) {
      // An administrator who loses access to "Users & roles" could never fix it again.
      if (c.role === 'admin' && c.area === 'users' && c.level !== 'full') {
        throw new BadRequestException('Administrators must keep full access to Users & roles');
      }
    }
    for (const c of dto.changes) {
      const row = (await this.repo.findOne({ where: { role: c.role, area: c.area } }))
        ?? this.repo.create({ role: c.role, area: c.area });
      row.level = c.level;
      row.updatedBy = actorId;
      await this.repo.save(row);
    }
    await this.audit.log({
      actorId, action: 'ROLE_PERMISSIONS_UPDATED', resourceType: 'role_permission',
      details: { changes: dto.changes },
    });
    return this.matrix();
  }
}
