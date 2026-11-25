import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested,
} from 'class-validator';
import {
  ACCESS_LEVELS, AccessLevel, Role, RolePermission, SCREEN_DEFS, SYSTEM_ROLES, Screen, UserScreenPermission, defaultLevel,
} from './role-permissions';
import { User } from '../users/user.entity';
import { AuditService } from '../audit/audit.service';

export class PermissionChangeDto {
  @IsString() @MaxLength(30)
  role: string;

  /** The screen key. */
  @IsString() @MaxLength(40)
  area: string;

  @IsIn(ACCESS_LEVELS)
  level: AccessLevel;
}

export class UpdatePermissionsDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PermissionChangeDto)
  changes: PermissionChangeDto[];
}

export class UserScreenChangeDto {
  /** The screen key, for example "sales". */
  @IsString() @MaxLength(40)
  key: string;

  /** A level, or null to go back to what the user's role gives. */
  @IsOptional() @IsIn(ACCESS_LEVELS)
  level: AccessLevel | null;
}

export class SetUserAccessDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => UserScreenChangeDto)
  screens: UserScreenChangeDto[];
}

export class CreateRoleDto {
  @IsString() @Matches(/^[a-z][a-z0-9_]{1,29}$/, { message: 'Key must be 2-30 lowercase letters, digits or underscores' })
  key: string;

  @IsString() @MaxLength(80)
  name: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;
}

/** Screens an administrator must always be able to open, or nobody could repair the settings. */
const ADMIN_LOCKED = new Set(['roles', 'users']);

@Injectable()
export class RolePermissionsService implements OnModuleInit {
  private readonly logger = new Logger(RolePermissionsService.name);
  /** role -> screen -> level; cleared whenever permissions change. */
  private cache: Map<string, Map<string, AccessLevel>> | null = null;
  /** user id -> screen -> level, for users with their own screen settings. */
  private userCache: Map<number, Map<string, AccessLevel>> | null = null;

  constructor(
    @InjectRepository(RolePermission) private readonly repo: Repository<RolePermission>,
    @InjectRepository(Role) private readonly roles: Repository<Role>,
    @InjectRepository(Screen) private readonly screens: Repository<Screen>,
    @InjectRepository(UserScreenPermission) private readonly userRepo: Repository<UserScreenPermission>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  /** Register the built-in roles and screens, drop permissions of screens that no longer exist, and fill the gaps. */
  async onModuleInit() {
    try {
      // roles
      const haveRoles = new Map((await this.roles.find()).map((r) => [r.key, r]));
      let order = 0;
      for (const def of SYSTEM_ROLES) {
        order += 1;
        const row = haveRoles.get(def.key);
        if (!row) {
          await this.roles.save(this.roles.create({ ...def, isSystem: true, sortOrder: order }));
        } else if (!row.isSystem) {
          row.isSystem = true;
          await this.roles.save(row);
        }
      }
      // screens: paths and labels follow the code; an administrator's hide/show choice is kept
      const haveScreens = new Map((await this.screens.find()).map((s) => [s.key, s]));
      order = 0;
      for (const def of SCREEN_DEFS) {
        order += 1;
        const row = haveScreens.get(def.key) ?? this.screens.create({ key: def.key, isActive: true });
        Object.assign(row, { path: def.path, label: def.label, group: def.group, sortOrder: order });
        await this.screens.save(row);
      }
      // permissions
      const roleRows = await this.roles.find();
      const screenRows = await this.screens.find();
      const roleById = new Map(roleRows.map((r) => [r.id, r.key]));
      const screenById = new Map(screenRows.map((s) => [s.id, s.key]));
      const liveScreens = screenRows.filter((s) => SCREEN_DEFS.some((d) => d.key === s.key));
      const existing = await this.repo.find();
      // permissions of screens that no longer exist (or deleted roles) are dropped
      const stale = existing.filter((p) => !roleById.has(p.roleId) || !screenById.has(p.screenId) || !SCREEN_DEFS.some((d) => d.key === screenById.get(p.screenId)));
      if (stale.length) await this.repo.remove(stale);
      const have = new Set(existing.filter((p) => !stale.includes(p)).map((p) => `${p.roleId}|${p.screenId}`));
      const missing: RolePermission[] = [];
      for (const s of liveScreens) {
        for (const r of roleRows) {
          if (!have.has(`${r.id}|${s.id}`)) missing.push(this.repo.create({ roleId: r.id, screenId: s.id, level: defaultLevel(s.key, r.key) }));
        }
      }
      if (missing.length) {
        await this.repo.save(missing);
        this.logger.log(`Seeded ${missing.length} role permissions`);
      }
      this.cache = null;
    } catch (err) {
      this.logger.error(`Could not seed roles, screens and permissions: ${(err as Error).message}`);
    }
  }

  private async load(): Promise<Map<string, Map<string, AccessLevel>>> {
    if (this.cache) return this.cache;
    const map = new Map<string, Map<string, AccessLevel>>();
    const roleKey = new Map((await this.roles.find()).map((r) => [r.id, r.key]));
    const screenKey = new Map((await this.screens.find()).map((s) => [s.id, s.key]));
    for (const p of await this.repo.find()) {
      const role = roleKey.get(p.roleId);
      const screen = screenKey.get(p.screenId);
      if (!role || !screen) continue;
      if (!map.has(role)) map.set(role, new Map());
      map.get(role)!.set(screen, p.level);
    }
    this.cache = map;
    return map;
  }

  private async loadUsers(): Promise<Map<number, Map<string, AccessLevel>>> {
    if (this.userCache) return this.userCache;
    const map = new Map<number, Map<string, AccessLevel>>();
    const screenKey = new Map((await this.screens.find()).map((s) => [s.id, s.key]));
    for (const p of await this.userRepo.find()) {
      const screen = screenKey.get(p.screenId);
      if (!screen) continue;
      if (!map.has(p.userId)) map.set(p.userId, new Map());
      map.get(p.userId)!.set(screen, p.level);
    }
    this.userCache = map;
    return map;
  }

  /** Level one role has on one screen. */
  async levelFor(role: string, screen: string): Promise<AccessLevel> {
    if (role === 'admin' && ADMIN_LOCKED.has(screen)) return 'full';
    return (await this.load()).get(role)?.get(screen) ?? defaultLevel(screen, role);
  }

  /** Level one user has on one screen: their own setting if an administrator gave them one, otherwise their role's (used by the API guard). */
  async levelForUser(userId: number, role: string, screen: string): Promise<AccessLevel> {
    if (role === 'admin' && ADMIN_LOCKED.has(screen)) return 'full';
    const own = (await this.loadUsers()).get(userId)?.get(screen);
    return own ?? (await this.levelFor(role, screen));
  }

  async roleList() {
    const rows = await this.roles.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem }));
  }

  /** Every active screen with this user's access level: the sidebar, route guard and action buttons read this. */
  async forUser(userId: number, role: string) {
    const screens = await this.screens.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    return Promise.all(screens.map(async (s) => ({
      key: s.key, path: s.path, label: s.label, group: s.group,
      level: await this.levelForUser(userId, role, s.key),
    })));
  }

  /** One user's screens for the admin editor: what their role gives, their own setting (if any) and the result. */
  async userAccess(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const screens = await this.screens.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
    const own = (await this.loadUsers()).get(userId);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role, roleId: user.roleId, userCode: user.userCode, isActive: user.isActive },
      screens: await Promise.all(screens.map(async (s) => {
        const roleLevel = await this.levelFor(user.role, s.key);
        const override = own?.get(s.key) ?? null;
        return { key: s.key, label: s.label, path: s.path, group: s.group, roleLevel, override, level: await this.levelForUser(userId, user.role, s.key) };
      })),
    };
  }

  /** Set or clear a user's own level on several screens at once. A null level removes the user's own setting. */
  async setUserAccess(userId: number, dto: SetUserAccessDto, actorId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const screenIds = new Map((await this.screens.find()).map((s) => [s.key, s.id]));
    for (const c of dto.screens) {
      if (!screenIds.has(c.key)) throw new BadRequestException(`Unknown screen "${c.key}"`);
      if (user.role === 'admin' && ADMIN_LOCKED.has(c.key) && c.level != null && c.level !== 'full') {
        throw new BadRequestException('Administrators must keep full access to Users and Roles & permissions');
      }
    }
    for (const c of dto.screens) {
      const screenId = screenIds.get(c.key)!;
      const row = await this.userRepo.findOne({ where: { userId, screenId } });
      if (c.level == null) {
        if (row) await this.userRepo.remove(row);
      } else {
        await this.userRepo.save(Object.assign(row ?? this.userRepo.create({ userId, screenId }), { level: c.level, updatedBy: actorId }));
      }
    }
    this.userCache = null;
    await this.audit.log({
      actorId, action: 'USER_SCREEN_ACCESS_UPDATED', resourceType: 'user', resourceId: userId,
      details: { changes: dto.screens.map((c) => ({ screen: c.key, level: c.level })) },
    });
    return this.userAccess(userId);
  }

  /** The matrix as the Roles page shows it. */
  async matrix() {
    const [roleRows, screenRows, perms] = await Promise.all([
      this.roleList(),
      this.screens.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } }),
      this.repo.find(),
    ]);
    const levels = new Map(perms.map((p) => [`${p.roleId}|${p.screenId}`, p.level]));
    return {
      roles: roleRows.map((r) => r.key),
      roleInfo: roleRows,
      levels: ACCESS_LEVELS,
      rows: screenRows.map((s) => ({
        area: s.key,
        label: s.label,
        group: s.group,
        path: s.path,
        levels: Object.fromEntries(roleRows.map((r) => [r.key, levels.get(`${r.id}|${s.id}`) ?? defaultLevel(s.key, r.key)])),
      })),
    };
  }

  async update(dto: UpdatePermissionsDto, actorId: number) {
    const roleIds = new Map((await this.roles.find()).map((r) => [r.key, r.id]));
    const screenIds = new Map((await this.screens.find()).map((s) => [s.key, s.id]));
    for (const c of dto.changes) {
      if (!roleIds.has(c.role)) throw new BadRequestException(`Unknown role "${c.role}"`);
      if (!screenIds.has(c.area)) throw new BadRequestException(`Unknown screen "${c.area}"`);
      // An administrator who loses access to these could never fix it again.
      if (c.role === 'admin' && ADMIN_LOCKED.has(c.area) && c.level !== 'full') {
        throw new BadRequestException('Administrators must keep full access to Users and Roles & permissions');
      }
    }
    for (const c of dto.changes) {
      const roleId = roleIds.get(c.role)!;
      const screenId = screenIds.get(c.area)!;
      const row = (await this.repo.findOne({ where: { roleId, screenId } }))
        ?? this.repo.create({ roleId, screenId });
      row.level = c.level;
      row.updatedBy = actorId;
      await this.repo.save(row);
    }
    this.cache = null;
    this.userCache = null;
    await this.audit.log({
      actorId, action: 'ROLE_PERMISSIONS_UPDATED', resourceType: 'role_permission',
      details: { changes: dto.changes },
    });
    return this.matrix();
  }

  async createRole(dto: CreateRoleDto, actorId: number) {
    if (await this.roles.findOne({ where: { key: dto.key } })) throw new ConflictException(`Role "${dto.key}" already exists`);
    const count = await this.roles.count();
    const role = await this.roles.save(this.roles.create({
      key: dto.key, name: dto.name.trim(), description: dto.description?.trim() || null, isSystem: false, sortOrder: count + 1,
    }));
    const screenRows = await this.screens.find();
    await this.repo.save(screenRows.map((s) => this.repo.create({ roleId: role.id, screenId: s.id, level: defaultLevel(s.key, role.key) })));
    this.cache = null;
    await this.audit.log({ actorId, action: 'ROLE_CREATED', resourceType: 'role', resourceId: role.id, details: { key: role.key } });
    return this.matrix();
  }

  async deleteRole(key: string, actorId: number) {
    const role = await this.roles.findOne({ where: { key } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('Built-in roles cannot be deleted');
    const inUse = await this.users.count({ where: { roleId: role.id } });
    if (inUse) throw new BadRequestException(`${inUse} user(s) still have this role. Change their role first.`);
    await this.repo.delete({ roleId: role.id });
    await this.roles.remove(role);
    this.cache = null;
    await this.audit.log({ actorId, action: 'ROLE_DELETED', resourceType: 'role', details: { key } });
    return this.matrix();
  }

  /** The number stored in users.role_id for a role key, or null when there is no such active role. */
  async roleIdOf(key: string): Promise<number | null> {
    return (await this.roles.findOne({ where: { key, isActive: true } }))?.id ?? null;
  }

  /** True when `key` is a role that can be assigned to a user. */
  async isAssignable(key: string): Promise<boolean> {
    return (await this.roles.count({ where: { key, isActive: true } })) > 0;
  }

  /** Keys of every role in `keys` that exists (helper for validation). */
  async existing(keys: string[]): Promise<string[]> {
    return (await this.roles.find({ where: { key: In(keys) } })).map((r) => r.key);
  }
}
