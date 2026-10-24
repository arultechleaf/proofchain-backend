// One-off copy of every table from the SQLite database into MySQL.
//
//   1. Set DB_* in .env to the MySQL target and start the backend once with DB_TYPE=mysql so
//      TypeORM creates the tables (or pass DB_DATABASE of an already-synced database).
//   2. node migrate-sqlite-to-mysql.js            (copies; refuses if the target has rows)
//      node migrate-sqlite-to-mysql.js --replace  (empties the target tables first)
//
// Reads SQLITE_PATH and DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_DATABASE from .env.
require('dotenv').config({ quiet: true });
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');

// Parents before children, so a failed run is easier to reason about.
const TABLES = [
  'companies', 'users', 'deliveries', 'approvals', 'blockchain_transactions', 'proof_records',
  'audit_logs', 'parties', 'items', 'stock_movements', 'invoices', 'invoice_lines', 'payments',
  'razorpay_orders',
];

/** SQLite stores dates as text, sometimes ISO with a trailing Z, which MySQL DATETIME rejects. */
function toMysqlDateTime(value) {
  if (value === null || value === undefined) return null;
  const d = new Date(typeof value === 'string' && !/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 23).replace('T', ' ');
}

(async () => {
  const replace = process.argv.includes('--replace');
  const sqlite = new Database(process.env.SQLITE_PATH || './proofchain.sqlite', { readonly: true });
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  });
  console.log(`SQLite ${process.env.SQLITE_PATH || './proofchain.sqlite'}  ->  MySQL ${process.env.DB_DATABASE}`);

  const existing = [];
  for (const t of TABLES) {
    const [[row]] = await conn.query(`SELECT COUNT(*) c FROM \`${t}\``);
    if (row.c > 0) existing.push(`${t} (${row.c})`);
  }
  if (existing.length && !replace) {
    console.log('Target already has data: ' + existing.join(', ') + '\nRe-run with --replace to empty these tables first.');
    process.exit(1);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  if (replace) for (const t of [...TABLES].reverse()) await conn.query(`TRUNCATE TABLE \`${t}\``);

  let failed = false;
  for (const t of TABLES) {
    const [cols] = await conn.query(
      'SELECT COLUMN_NAME name, DATA_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [t]);
    const sqliteCols = new Set(sqlite.prepare(`PRAGMA table_info(\`${t}\`)`).all().map((c) => c.name));
    const shared = cols.filter((c) => sqliteCols.has(c.name));
    const rows = sqlite.prepare(`SELECT ${shared.map((c) => `\`${c.name}\``).join(', ')} FROM \`${t}\``).all();

    if (rows.length) {
      const sql = `INSERT INTO \`${t}\` (${shared.map((c) => `\`${c.name}\``).join(', ')}) VALUES ?`;
      const values = rows.map((r) =>
        shared.map((c) => (c.type === 'datetime' || c.type === 'timestamp' ? toMysqlDateTime(r[c.name]) : r[c.name])));
      try {
        await conn.query(sql, [values]);
      } catch (err) {
        failed = true;
        console.log(`  ${t.padEnd(26)} FAILED: ${err.message}`);
        continue;
      }
    }
    const [[after]] = await conn.query(`SELECT COUNT(*) c FROM \`${t}\``);
    const ok = after.c === rows.length;
    if (!ok) failed = true;
    console.log(`  ${t.padEnd(26)} ${String(rows.length).padStart(4)} rows  ->  ${String(after.c).padStart(4)} in MySQL  ${ok ? 'ok' : 'MISMATCH'}`);
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
  sqlite.close();
  console.log(failed ? '\nFinished with errors.' : '\nDone. Set DB_TYPE=mysql in .env and restart the backend.');
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
