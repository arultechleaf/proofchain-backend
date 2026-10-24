/**
 * Direct SQLite seed for ProofChain (no API needed)
 * Run: node --require dotenv/config seed-sqlite.js
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const { randomUUID } = require('crypto');
const path = require('path');

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'proofchain.sqlite');

function sha256(str) {
  return require('crypto').createHash('sha256').update(str, 'utf8').digest('hex');
}

async function main() {
  const db = new Database(DB_PATH);
  console.log(`🗄  Connected to: ${DB_PATH}\n`);

  // Disable FK checks and wipe existing seed data cleanly
  db.pragma('foreign_keys = OFF');
  for (const tbl of ['audit_logs','proof_records','blockchain_transactions','approvals','deliveries','users','companies']) {
    try { db.prepare(`DELETE FROM ${tbl}`).run(); } catch {}
  }
  db.pragma('foreign_keys = ON');
  console.log('🧹 Cleared existing data\n');

  // IDs
  const compAId = randomUUID();
  const compBId = randomUUID();
  const auditId = randomUUID();
  const adminId = randomUUID();
  const aliceId = randomUUID();
  const bobId   = randomUUID();
  const carolId = randomUUID();

  // Hash passwords
  const adminHash = await bcrypt.hash('Admin@123456', 10);
  const aliceHash = await bcrypt.hash('Alice@123456', 10);
  const bobHash   = await bcrypt.hash('Bob@123456', 10);
  const carolHash = await bcrypt.hash('Carol@123456', 10);

  const now = new Date().toISOString();

  // -- Companies
  console.log('📦 Seeding companies...');
  const insComp = db.prepare(`
    INSERT OR IGNORE INTO companies (id, name, organization_code, organization_type, description, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`);

  insComp.run(compAId, 'Company A — Shipper', 'COMP-A', 'sender', 'Primary goods sender and delivery initiator', now, now);
  insComp.run(compBId, 'Company B — Receiver', 'COMP-B', 'receiver', 'Delivery receiver and approver', now, now);
  insComp.run(auditId, 'Auditor Corp', 'AUDIT-1', 'auditor', 'Independent auditor with read-only access', now, now);
  console.log('  ✓ 3 companies');

  // -- Users
  console.log('👤 Seeding users...');
  const insUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, email, password_hash, role, company_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`);

  insUser.run(adminId, 'Admin User',         'admin@proofchain.dev', adminHash, 'admin',     compAId, now, now);
  insUser.run(aliceId, 'Alice (Company A)',   'alice@companya.dev',  aliceHash, 'company_a', compAId, now, now);
  insUser.run(bobId,   'Bob (Company B)',     'bob@companyb.dev',    bobHash,   'company_b', compBId, now, now);
  insUser.run(carolId, 'Carol (Auditor)',     'carol@auditor.dev',   carolHash, 'auditor',   auditId, now, now);
  console.log('  ✓ 4 users');

  // -- Deliveries
  console.log('🚚 Seeding deliveries...');
  const insDelivery = db.prepare(`
    INSERT OR IGNORE INTO deliveries
      (id, delivery_reference, sender_company_id, receiver_company_id, description, quantity,
       metadata, payload_hash, status, blockchain_status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const deliveries = [
    { ref: 'DEL-2024-001', desc: 'Electronic components — Batch A', qty: 500, status: 'approved',  bs: 'confirmed', meta: JSON.stringify({weight:'25kg',fragile:true,priority:'high'}) },
    { ref: 'DEL-2024-002', desc: 'Raw materials — Steel sheets',   qty: 1200, status: 'approved',  bs: 'confirmed', meta: JSON.stringify({weight:'600kg',pallets:4}) },
    { ref: 'DEL-2024-003', desc: 'Medical supplies — Sterile gloves', qty: 10000, status: 'rejected', bs: 'confirmed', meta: JSON.stringify({temperature:'ambient',certified:true}) },
    { ref: 'DEL-2024-004', desc: 'Spare parts — Engine components', qty: 75,   status: 'pending',  bs: 'confirmed', meta: JSON.stringify({partNumbers:['EP-001','EP-002'],urgent:true}) },
    { ref: 'DEL-2024-005', desc: 'Packaging — Bubble wrap rolls',   qty: 300,  status: 'pending',  bs: 'confirmed', meta: JSON.stringify({rolls:300,width:'50cm'}) },
    { ref: 'DEL-2024-006', desc: 'Chemical reagents — Lab grade',   qty: 50,   status: 'pending',  bs: 'pending',   meta: JSON.stringify({hazardous:false,grade:'analytical'}) },
  ];

  const deliveryIds = {};
  for (const d of deliveries) {
    const id = randomUUID();
    deliveryIds[d.ref] = id;
    const payload = JSON.stringify({ deliveryId: id, deliveryReference: d.ref, senderCompanyId: compAId, receiverCompanyId: compBId, description: d.desc, quantity: d.qty, metadata: JSON.parse(d.meta) });
    const hash = sha256(payload);
    insDelivery.run(id, d.ref, compAId, compBId, d.desc, d.qty, d.meta, hash, d.status, d.bs, aliceId, now, now);
    console.log(`  ✓ ${d.ref} [${d.status}]`);
  }

  // -- Blockchain Transactions
  console.log('🔗 Seeding blockchain transactions...');
  const insTx = db.prepare(`
    INSERT OR IGNORE INTO blockchain_transactions
      (id, delivery_id, transaction_hash, block_number, contract_address, transaction_type, status, retry_count, error_message, gas_used, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`);

  const demoContract = '0x0000000000000000000000000000000000000000';
  let blockNum = 100001;
  for (const [ref, delId] of Object.entries(deliveryIds)) {
    const txHash = '0x' + randomUUID().replace(/-/g,'') + randomUUID().replace(/-/g,'').slice(0,32);
    const d = deliveries.find(x => x.ref === ref);
    const txStatus = d.bs === 'confirmed' ? 'confirmed' : 'pending';
    insTx.run(randomUUID(), delId, txHash, blockNum++, demoContract, 'proof_registration', txStatus,
      txStatus !== 'confirmed' ? null : null, txStatus === 'confirmed' ? 21000 : null, now, now);
  }
  console.log(`  ✓ ${Object.keys(deliveryIds).length} transactions`);

  // -- Proof Records
  console.log('📜 Seeding proof records...');
  const insProof = db.prepare(`
    INSERT OR IGNORE INTO proof_records
      (id, delivery_id, algorithm, payload_hash, blockchain_transaction_id, verified_at, verification_status, canonical_payload, created_at)
    VALUES (?, ?, 'SHA-256', ?, ?, ?, ?, ?, ?)`);

  for (const [ref, delId] of Object.entries(deliveryIds)) {
    const d = deliveries.find(x => x.ref === ref);
    const row = db.prepare('SELECT payload_hash FROM deliveries WHERE id = ?').get(delId);
    const txRow = db.prepare('SELECT id FROM blockchain_transactions WHERE delivery_id = ?').get(delId);
    const vs = d.status === 'approved' ? 'verified' : d.status === 'rejected' ? 'verified' : 'pending';
    insProof.run(randomUUID(), delId, row.payload_hash, txRow?.id ?? null,
      vs === 'verified' ? now : null, vs,
      JSON.stringify({ deliveryId: delId, deliveryReference: ref }), now);
  }
  console.log(`  ✓ ${Object.keys(deliveryIds).length} proof records`);

  // -- Audit Logs
  console.log('📋 Seeding audit logs...');
  const insAudit = db.prepare(`
    INSERT OR IGNORE INTO audit_logs (id, actor_id, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '127.0.0.1', ?)`);

  insAudit.run(randomUUID(), aliceId, 'LOGIN',           'auth',     aliceId, JSON.stringify({role:'company_a'}), now);
  insAudit.run(randomUUID(), bobId,   'LOGIN',           'auth',     bobId,   JSON.stringify({role:'company_b'}), now);
  insAudit.run(randomUUID(), adminId, 'LOGIN',           'auth',     adminId, JSON.stringify({role:'admin'}),     now);
  for (const [ref, delId] of Object.entries(deliveryIds)) {
    insAudit.run(randomUUID(), aliceId, 'CREATE_DELIVERY', 'delivery', delId, JSON.stringify({ref}), now);
  }
  insAudit.run(randomUUID(), bobId, 'DELIVERY_APPROVED', 'delivery', deliveryIds['DEL-2024-001'], JSON.stringify({comment:'Verified'}), now);
  insAudit.run(randomUUID(), bobId, 'DELIVERY_APPROVED', 'delivery', deliveryIds['DEL-2024-002'], JSON.stringify({comment:'Confirmed'}), now);
  insAudit.run(randomUUID(), bobId, 'DELIVERY_REJECTED', 'delivery', deliveryIds['DEL-2024-003'], JSON.stringify({comment:'Packaging damaged'}), now);
  console.log('  ✓ Audit logs written');

  db.close();

  console.log(`
✅ Seed complete! Login credentials:

  Admin:     admin@proofchain.dev  / Admin@123456
  Company A: alice@companya.dev    / Alice@123456
  Company B: bob@companyb.dev      / Bob@123456
  Auditor:   carol@auditor.dev     / Carol@123456

  🌐 Frontend:  http://localhost:3000
  📄 API Docs:  http://localhost:3001/api/docs
`);
}

main().catch(e => { console.error('❌ Seed failed:', e.message); process.exit(1); });
