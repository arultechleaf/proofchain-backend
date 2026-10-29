/**
 * One-time migration: users.role (the role's text key, e.g. "admin") becomes users.role_id (the number from roles.id), and
 * role_permissions.role / .area (text keys) become role_id / screen_id (numbers from roles.id / screens.id).
 *
 *   node database/migrate-role-ids.js --check   read-only report
 *   node database/migrate-role-ids.js --yes     performs the migration (back up first)
 */
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

async function main() {
  const check = process.argv.includes('--check');
  if (!check && !process.argv.includes('--yes')) { console.log('Pass --check or --yes'); process.exit(1); }
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE });
  const rows = async (sql, p) => (await db.query(sql, p))[0];
  const has = async (t, c) => (await rows('SELECT 1 x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c])).length > 0;

  if (!(await has('users', 'role'))) { console.log('users.role is already gone (role_id in use). Nothing to do.'); await db.end(); return; }
  const roles = await rows('SELECT id, `key` FROM roles');
  const screens = await rows('SELECT id, `key` FROM screens');
  if (!roles.length || !screens.length) throw new Error('The roles and screens tables are empty. Start the API once so it seeds them, then run this again.');
  const rk = new Set(roles.map((r) => r.key)); const sk = new Set(screens.map((s) => s.key));

  const badUsers = (await rows('SELECT DISTINCT role r FROM users')).map((x) => x.r).filter((r) => !rk.has(r));
  const badPerms = (await rows('SELECT role, area FROM role_permissions')).filter((p) => !rk.has(p.role) || !sk.has(p.area));
  console.log(`users: ${(await rows('SELECT COUNT(*) n FROM users'))[0].n}, role_permissions: ${(await rows('SELECT COUNT(*) n FROM role_permissions'))[0].n}`);
  if (badUsers.length) console.log('Users with an unknown role:', badUsers.join(', '));
  if (badPerms.length) console.log(`${badPerms.length} permission row(s) point at an unknown role or screen (they will be deleted)`);
  if (badUsers.length) throw new Error('Fix the unknown roles first.');
  if (check) { console.log('Check finished. Nothing was changed.'); await db.end(); return; }

  const run = (sql) => db.query(sql);
  await run('SET FOREIGN_KEY_CHECKS=0');
  // users
  await run('ALTER TABLE users ADD COLUMN role_id INT NULL');
  await run('UPDATE users u JOIN roles r ON r.`key` = u.role SET u.role_id = r.id');
  await run('ALTER TABLE users MODIFY role_id INT NOT NULL, DROP COLUMN role');
  // role_permissions
  await run('DELETE p FROM role_permissions p LEFT JOIN roles r ON r.`key` = p.role LEFT JOIN screens s ON s.`key` = p.area WHERE r.id IS NULL OR s.id IS NULL');
  await run('ALTER TABLE role_permissions ADD COLUMN role_id INT NULL, ADD COLUMN screen_id INT NULL');
  await run('UPDATE role_permissions p JOIN roles r ON r.`key` = p.role JOIN screens s ON s.`key` = p.area SET p.role_id = r.id, p.screen_id = s.id');
  await run('ALTER TABLE role_permissions MODIFY role_id INT NOT NULL, MODIFY screen_id INT NOT NULL, DROP COLUMN role, DROP COLUMN area');
  await run('SET FOREIGN_KEY_CHECKS=1');
  for (const [t, c] of [['users', 'role_id'], ['role_permissions', 'role_id'], ['role_permissions', 'screen_id']]) {
    const [{ n, m }] = await rows(`SELECT COUNT(*) n, COUNT(DISTINCT ${c}) m FROM ${t}`); console.log(`  ${t}.${c}: ${n} rows, ${m} distinct`);
  }
  console.log('Done. Start the API with the updated code.');
  await db.end();
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
