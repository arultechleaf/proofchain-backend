/**
 * ProofChain REST Seed Script
 * Seeds demo data via the running API at http://localhost:3001
 * Run: node seed-api.js
 */

const API = 'http://localhost:3001/api';

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn(`  ⚠ POST ${path} → ${res.status}:`, JSON.stringify(data).slice(0, 120));
    return null;
  }
  return data;
}

async function get(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return res.json();
}

async function main() {
  console.log('🌱 ProofChain API Seed\n');

  // 1. Register companies
  console.log('📦 Creating companies...');
  const companyA = await post('/companies', {
    name: 'Company A — Shipper', organizationCode: 'COMP-A', organizationType: 'sender',
    description: 'Primary goods sender and delivery initiator',
  });
  const companyB = await post('/companies', {
    name: 'Company B — Receiver', organizationCode: 'COMP-B', organizationType: 'receiver',
    description: 'Delivery receiver and approver',
  });
  const auditCo = await post('/companies', {
    name: 'Auditor Corp', organizationCode: 'AUDIT-1', organizationType: 'auditor',
    description: 'Independent auditor with read-only access',
  });
  const compAId = companyA?.data?.id;
  const compBId = companyB?.data?.id;
  const auditId = auditCo?.data?.id;
  console.log(`  ✓ Companies: ${compAId?.slice(0,8)}, ${compBId?.slice(0,8)}, ${auditId?.slice(0,8)}`);

  // 2. Register users
  console.log('👤 Creating users...');
  await post('/auth/register', {
    name: 'Admin User', email: 'admin@proofchain.dev',
    password: 'Admin@123456', role: 'admin', companyId: compAId,
  });
  await post('/auth/register', {
    name: 'Alice (Company A)', email: 'alice@companya.dev',
    password: 'Alice@123456', role: 'company_a', companyId: compAId,
  });
  await post('/auth/register', {
    name: 'Bob (Company B)', email: 'bob@companyb.dev',
    password: 'Bob@123456', role: 'company_b', companyId: compBId,
  });
  await post('/auth/register', {
    name: 'Carol (Auditor)', email: 'carol@auditor.dev',
    password: 'Carol@123456', role: 'auditor', companyId: auditId,
  });
  console.log('  ✓ Users created');

  // 3. Login as admin
  const loginRes = await post('/auth/login', {
    email: 'admin@proofchain.dev', password: 'Admin@123456',
  });
  const token = loginRes?.data?.accessToken;
  if (!token) { console.error('  ✗ Login failed — cannot seed deliveries'); return; }
  console.log('  ✓ Logged in as admin');

  // 4. Create deliveries as Company A
  console.log('🚚 Creating deliveries...');
  const loginA = await post('/auth/login', { email: 'alice@companya.dev', password: 'Alice@123456' });
  const tokenA = loginA?.data?.accessToken;

  const deliveries = [
    { deliveryReference: 'DEL-2024-001', description: 'Electronic components — Batch A', quantity: 500, metadata: { weight: '25kg', fragile: true, priority: 'high' } },
    { deliveryReference: 'DEL-2024-002', description: 'Raw materials — Steel sheets', quantity: 1200, metadata: { weight: '600kg', pallets: 4 } },
    { deliveryReference: 'DEL-2024-003', description: 'Medical supplies — Sterile gloves', quantity: 10000, metadata: { temperature: 'ambient', certified: true } },
    { deliveryReference: 'DEL-2024-004', description: 'Spare parts — Engine components', quantity: 75, metadata: { partNumbers: ['EP-001', 'EP-002'], urgent: true } },
    { deliveryReference: 'DEL-2024-005', description: 'Packaging materials — Bubble wrap rolls', quantity: 300, metadata: { rolls: 300, width: '50cm' } },
  ];

  const createdDeliveries = [];
  for (const d of deliveries) {
    const res = await post('/deliveries', { ...d, receiverCompanyId: compBId }, tokenA);
    if (res?.data) {
      createdDeliveries.push(res.data);
      console.log(`  ✓ Created ${d.deliveryReference} (hash: ${res.data.payloadHash?.slice(0,16)}...)`);
    }
  }

  // 5. Approve some deliveries as Company B
  console.log('✅ Approving deliveries...');
  const loginB = await post('/auth/login', { email: 'bob@companyb.dev', password: 'Bob@123456' });
  const tokenB = loginB?.data?.accessToken;

  if (createdDeliveries[0]) {
    await post(`/deliveries/${createdDeliveries[0].id}/approvals`, { decision: 'approved', comment: 'Verified — all items received in good condition' }, tokenB);
    console.log(`  ✓ Approved ${deliveries[0].deliveryReference}`);
  }
  if (createdDeliveries[1]) {
    await post(`/deliveries/${createdDeliveries[1].id}/approvals`, { decision: 'approved', comment: 'Quantity and quality confirmed' }, tokenB);
    console.log(`  ✓ Approved ${deliveries[1].deliveryReference}`);
  }
  if (createdDeliveries[2]) {
    await post(`/deliveries/${createdDeliveries[2].id}/approvals`, { decision: 'rejected', comment: 'Packaging damaged — returning to sender' }, tokenB);
    console.log(`  ✓ Rejected ${deliveries[2].deliveryReference}`);
  }

  // 6. Verify a delivery
  if (createdDeliveries[0]) {
    console.log('🔍 Verifying delivery proof...');
    const vRes = await post(`/verification/${createdDeliveries[0].id}/verify`, {}, tokenB);
    console.log(`  ✓ Verification status: ${vRes?.data?.status ?? 'unknown'}`);
  }

  console.log('\n✅ Seed complete! Login credentials:\n');
  console.log('  Admin:     admin@proofchain.dev    / Admin@123456');
  console.log('  Company A: alice@companya.dev      / Alice@123456');
  console.log('  Company B: bob@companyb.dev        / Bob@123456');
  console.log('  Auditor:   carol@auditor.dev       / Carol@123456\n');
  console.log('  Frontend:  http://localhost:3000');
  console.log('  API Docs:  http://localhost:3001/api/docs');
}

main().catch(console.error);
