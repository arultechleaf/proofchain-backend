/**
 * One-time migration: every table's id (and every column that points at another table's id) changes from a
 * 36-character UUID to a whole number (1, 2, 3 ...), keeping all data and relationships.
 *
 *   node database/migrate-to-numeric-ids.js --check   read-only: reports what would happen, changes nothing
 *   node database/migrate-to-numeric-ids.js --yes     performs the migration (take a backup first!)
 *
 * It uses the database in backend/.env. It refuses to run twice. Afterwards it re-computes the SHA-256 proof hashes of
 * deliveries and invoices (they include ids), and rewrites ids that appear inside audit-log details and notification links.
 */
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const PK_TABLES = [
  'users', 'companies', 'roles', 'screens', 'role_permissions', 'parties', 'items', 'bank_accounts', 'bank_transactions',
  'deliveries', 'blockchain_transactions', 'approvals', 'proof_records', 'invoices', 'invoice_lines', 'payments',
  'quotations', 'quotation_lines', 'expenses', 'stock_movements', 'razorpay_orders', 'notifications', 'audit_logs',
];

// [child table, column, parent table]
const REFS = [
  ...['bank_accounts', 'bank_transactions', 'expenses', 'invoices', 'items', 'parties', 'payments', 'quotations', 'razorpay_orders', 'stock_movements', 'users']
    .map((t) => [t, 'company_id', 'companies']),
  ['deliveries', 'sender_company_id', 'companies'],
  ['deliveries', 'receiver_company_id', 'companies'],
  ['approvals', 'reviewer_id', 'users'], ['audit_logs', 'actor_id', 'users'], ['bank_transactions', 'created_by', 'users'],
  ['deliveries', 'created_by', 'users'], ['expenses', 'created_by', 'users'], ['invoices', 'created_by', 'users'],
  ['notifications', 'user_id', 'users'], ['payments', 'created_by', 'users'], ['quotations', 'created_by', 'users'],
  ['razorpay_orders', 'created_by', 'users'], ['role_permissions', 'updated_by', 'users'], ['stock_movements', 'created_by', 'users'],
  ['invoices', 'party_id', 'parties'], ['payments', 'party_id', 'parties'], ['quotations', 'party_id', 'parties'], ['razorpay_orders', 'party_id', 'parties'],
  ['invoice_lines', 'item_id', 'items'], ['quotation_lines', 'item_id', 'items'], ['stock_movements', 'item_id', 'items'],
  ['invoice_lines', 'invoice_id', 'invoices'], ['payments', 'invoice_id', 'invoices'], ['blockchain_transactions', 'invoice_id', 'invoices'],
  ['quotations', 'converted_invoice_id', 'invoices'], ['razorpay_orders', 'invoice_id', 'invoices'],
  ['approvals', 'delivery_id', 'deliveries'], ['blockchain_transactions', 'delivery_id', 'deliveries'], ['proof_records', 'delivery_id', 'deliveries'],
  ['invoices', 'blockchain_transaction_id', 'blockchain_transactions'], ['proof_records', 'blockchain_transaction_id', 'blockchain_transactions'],
  ['quotation_lines', 'quotation_id', 'quotations'],
  ['bank_transactions', 'account_id', 'bank_accounts'], ['bank_transactions', 'counter_account_id', 'bank_accounts'],
  ['razorpay_orders', 'payment_record_id', 'payments'],
];

// child rows whose parent no longer exists are debris from failed saves; they are deleted instead of blocking the migration
const CLEAN_ORPHANS = [['invoice_lines', 'invoice_id', 'invoices']];

// text columns that may contain ids inside a string (audit details, notification links ...)
const TEXT_COLUMNS = [['audit_logs', 'resource_id'], ['audit_logs', 'details'], ['notifications', 'link'], ['notifications', 'message'], ['notifications', 'title'], ['deliveries', 'metadata']];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const q = (c) => '`' + c + '`';

function invoiceCanonical(i, lines) {
  return JSON.stringify({
    invoiceId: i.id, type: i.type, invoiceNumber: i.invoice_number, companyId: i.company_id, partyId: i.party_id,
    invoiceDate: i.invoice_date, dueDate: i.due_date ?? null,
    lines: lines.map((l) => ({ itemId: l.item_id ?? null, description: l.description, quantity: l.quantity, rate: l.rate, taxRate: l.tax_rate })),
    subtotal: i.subtotal, taxTotal: i.tax_total, discount: i.discount, total: i.total,
    ...(i.taxable_value == null ? {} : { gst: { taxableValue: i.taxable_value, cgst: i.cgst, sgst: i.sgst, igst: i.igst, roundOff: i.round_off } }),
  });
}
function deliveryCanonical(d) {
  return JSON.stringify({
    deliveryId: d.id, deliveryReference: d.delivery_reference, senderCompanyId: d.sender_company_id, receiverCompanyId: d.receiver_company_id,
    description: d.description, quantity: d.quantity, metadata: d.metadata == null ? null : JSON.parse(d.metadata),
  });
}

async function main() {
  const check = process.argv.includes('--check');
  if (!check && !process.argv.includes('--yes')) {
    console.log('Pass --check (read only) or --yes (performs the migration).');
    process.exit(1);
  }
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT || 3306, user: process.env.DB_USERNAME, password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE, dateStrings: true,
  });
  const run = (sql, params) => db.query(sql, params);
  const rows = async (sql, params) => (await db.query(sql, params))[0];
  console.log('Database:', process.env.DB_DATABASE);

  // ── guards ──
  const [{ t: idType }] = await rows("SELECT DATA_TYPE t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='id'");
  if (idType !== 'varchar') { console.log('users.id is already', idType, '- nothing to do.'); await db.end(); return; }

  // column nullability of every reference
  const nullable = {};
  for (const [t, c] of REFS) {
    const r = await rows("SELECT IS_NULLABLE n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?", [t, c]);
    if (!r.length) throw new Error(`Column ${t}.${c} does not exist`);
    nullable[t + '.' + c] = r[0].n === 'YES';
  }

  // ── read-only checks: every reference must point at a row that exists ──
  const ids = {};
  for (const t of PK_TABLES) ids[t] = new Set((await rows('SELECT id FROM ' + q(t))).map((r) => r.id));
  let problems = 0;
  for (const [t, c, p] of REFS) {
    const vals = (await rows(`SELECT DISTINCT ${q(c)} v FROM ${q(t)} WHERE ${q(c)} IS NOT NULL`)).map((r) => r.v);
    const orphan = vals.filter((v) => !ids[p].has(v));
    if (orphan.length) {
      const cleanable = CLEAN_ORPHANS.some(([a, b]) => a === t && b === c);
      if (!cleanable) problems += orphan.length;
      console.log(`ORPHAN  ${t}.${c} -> ${p}: ${orphan.length} value(s) point at nothing${cleanable ? ' (those rows will be deleted)' : ''}`);
    }
  }
  console.log('Rows per table:', PK_TABLES.map((t) => `${t}=${ids[t].size}`).join(' '));
  console.log(problems ? `Found ${problems} orphan reference(s).` : 'All references resolve.');

  // does my re-implementation of the proof hashes reproduce the stored ones (before the change)?
  const invs = await rows('SELECT * FROM invoices');
  let invOk = 0;
  for (const i of invs) {
    const lines = await rows('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY position', [i.id]);
    if (i.payload_hash && sha(invoiceCanonical(i, lines)) === i.payload_hash) invOk++;
  }
  const dels = await rows('SELECT * FROM deliveries');
  const delOk = dels.filter((d) => d.payload_hash && sha(deliveryCanonical(d)) === d.payload_hash).length;
  console.log(`Proof hashes that match today: invoices ${invOk}/${invs.length}, deliveries ${delOk}/${dels.length}`);

  if (check) { console.log('Check finished. Nothing was changed.'); await db.end(); return; }
  if (problems) { console.log('Fix the orphan references first (or restore from backup). Nothing was changed.'); process.exit(1); }

  // ── migrate ──
  console.log('Migrating ...');
  await run('SET FOREIGN_KEY_CHECKS=0');
  for (const v of ['purchases', 'purchase_lines', 'sales', 'sales_lines']) await run('DROP VIEW IF EXISTS ' + q(v)); // recreated when the API starts

  for (const [t, c, p] of CLEAN_ORPHANS) {
    const [r] = await run(`DELETE x FROM ${q(t)} x LEFT JOIN ${q(p)} p ON p.id = x.${q(c)} WHERE p.id IS NULL`);
    if (r.affectedRows) console.log(`  deleted ${r.affectedRows} orphan row(s) from ${t}`);
  }
  // 1. number every row (oldest first) in a helper column
  for (const t of PK_TABLES) {
    const cols = (await rows("SELECT COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME IN ('created_at','updated_at')", [t])).map((r) => r.c);
    const order = cols.includes('created_at') ? 'created_at' : cols.includes('updated_at') ? 'updated_at' : 'id';
    await run(`ALTER TABLE ${q(t)} ADD COLUMN ${q('__new')} INT NULL`);
    await run('SET @n:=0');
    await run(`UPDATE ${q(t)} SET ${q('__new')}=(@n:=@n+1) ORDER BY ${q(order)}, id`);
  }
  // old id -> new id, for ids that appear inside text
  const oldToNew = new Map();
  for (const t of PK_TABLES) for (const r of await rows(`SELECT id, __new n FROM ${q(t)}`)) oldToNew.set(r.id, r.n);

  // 2. translate every reference into a helper column
  for (const [t, c, p] of REFS) {
    await run(`ALTER TABLE ${q(t)} ADD COLUMN ${q(c + '__new')} INT NULL`);
    await run(`UPDATE ${q(t)} c JOIN ${q(p)} p ON c.${q(c)} = p.id SET c.${q(c + '__new')} = p.${q('__new')}`);
  }

  // 3. ids inside text (audit details, notification links ...)
  for (const [t, c] of TEXT_COLUMNS) {
    const pk = (await rows(`SELECT id, ${q(c)} v FROM ${q(t)} WHERE ${q(c)} IS NOT NULL`));
    let n = 0;
    for (const r of pk) {
      const next = String(r.v).replace(UUID_RE, (m) => (oldToNew.has(m) ? String(oldToNew.get(m)) : m));
      if (next !== r.v) { await run(`UPDATE ${q(t)} SET ${q(c)}=? WHERE id=?`, [next, r.id]); n++; }
    }
    if (n) console.log(`  rewrote ${n} value(s) in ${t}.${c}`);
  }

  // 4. drop foreign keys, swap in the numeric columns
  for (const fk of await rows("SELECT TABLE_NAME t, CONSTRAINT_NAME n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND CONSTRAINT_TYPE='FOREIGN KEY'")) {
    await run(`ALTER TABLE ${q(fk.t)} DROP FOREIGN KEY ${q(fk.n)}`);
  }
  for (const [t, c] of REFS) {
    const nl = nullable[t + '.' + c] ? 'NULL' : 'NOT NULL';
    await run(`ALTER TABLE ${q(t)} DROP COLUMN ${q(c)}, CHANGE COLUMN ${q(c + '__new')} ${q(c)} INT ${nl}`);
  }
  // 5. the primary keys
  for (const t of PK_TABLES) {
    await run(`ALTER TABLE ${q(t)} DROP PRIMARY KEY, DROP COLUMN id, CHANGE COLUMN ${q('__new')} id INT NOT NULL AUTO_INCREMENT FIRST, ADD PRIMARY KEY (id)`);
  }
  await run('SET FOREIGN_KEY_CHECKS=1');

  // 6. proof hashes include ids, so compute them again
  let reInv = 0; let reDel = 0;
  for (const i of await rows('SELECT * FROM invoices')) {
    const lines = await rows('SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY position', [i.id]);
    const canonical = invoiceCanonical(i, lines);
    await run('UPDATE invoices SET payload_hash=?, canonical_payload=? WHERE id=?', [sha(canonical), canonical, i.id]); reInv++;
  }
  for (const d of await rows('SELECT * FROM deliveries')) {
    const canonical = deliveryCanonical(d);
    const hash = sha(canonical);
    await run('UPDATE deliveries SET payload_hash=? WHERE id=?', [hash, d.id]);
    await run('UPDATE proof_records SET payload_hash=?, canonical_payload=? WHERE delivery_id=?', [hash, canonical, d.id]); reDel++;
  }
  console.log(`Re-computed proof hashes: ${reInv} invoices, ${reDel} deliveries`);

  for (const t of PK_TABLES) {
    const [{ n, m }] = await rows(`SELECT COUNT(*) n, MAX(id) m FROM ${q(t)}`);
    console.log(`  ${t.padEnd(24)} ${String(n).padStart(4)} rows, ids 1..${m ?? 0}`);
  }
  console.log('Done. Start the API with the updated code; it re-creates the sales/purchases views.');
  await db.end();
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
