// Seeds sample parties, items, invoices and payments through the running API.
// Usage: node seed-billing.js   (backend must be running; safe to re-run, it skips existing data)
const API = process.env.API_URL || 'http://localhost:3001/api';

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const { accessToken: token } = await call('POST', '/auth/login', null, {
    email: 'alice@companya.dev',
    password: process.env.SEED_PASSWORD || 'Alice@123456',
  });

  const existing = await call('GET', '/parties?limit=1', token);
  if (existing.total > 0) {
    console.log('Billing data already present — nothing to do.');
    return;
  }

  console.log('Creating parties...');
  const parties = {};
  for (const p of [
    { key: 'acme', name: 'Acme Retail Pvt Ltd', partyType: 'customer', phone: '9876500001', email: 'accounts@acme.example', taxId: '29ABCDE1234F1Z5', city: 'Bengaluru', address: '12 MG Road' },
    { key: 'sunrise', name: 'Sunrise Traders', partyType: 'customer', phone: '9876500002', city: 'Chennai', openingBalance: 2500 },
    { key: 'globex', name: 'Globex Components', partyType: 'supplier', phone: '9876500003', email: 'sales@globex.example', city: 'Mumbai' },
    { key: 'both', name: 'Orbit Wholesale', partyType: 'both', phone: '9876500004', city: 'Pune' },
  ]) {
    const { key, ...dto } = p;
    parties[key] = (await call('POST', '/parties', token, dto)).data;
  }

  console.log('Creating items...');
  const items = {};
  for (const i of [
    { key: 'sensor', name: 'Temperature Sensor', sku: 'SEN-001', unit: 'pcs', salePrice: 450, purchasePrice: 300, taxRate: 18, stock: 100, lowStockLevel: 20 },
    { key: 'cable', name: 'Shielded Cable 5m', sku: 'CAB-005', unit: 'pcs', salePrice: 120, purchasePrice: 80, taxRate: 12, stock: 15, lowStockLevel: 25 },
    { key: 'gateway', name: 'IoT Gateway', sku: 'GTW-100', unit: 'pcs', salePrice: 5200, purchasePrice: 3800, taxRate: 18, stock: 12, lowStockLevel: 5 },
  ]) {
    const { key, ...dto } = i;
    items[key] = (await call('POST', '/items', token, dto)).data;
  }

  console.log('Creating invoices and bills...');
  const today = new Date();
  const day = (offset) => new Date(today.getTime() - offset * 86400000).toISOString().slice(0, 10);

  const sale1 = (await call('POST', '/sales', token, {
    partyId: parties.acme.id, invoiceDate: day(12), dueDate: day(-2),
    lines: [{ itemId: items.sensor.id, quantity: 20 }, { itemId: items.gateway.id, quantity: 2 }],
    notes: 'Thank you for your business.',
  })).data;
  const sale2 = (await call('POST', '/sales', token, {
    partyId: parties.sunrise.id, invoiceDate: day(5), dueDate: day(-9), discount: 100,
    lines: [{ itemId: items.cable.id, quantity: 10 }, { description: 'Installation service', quantity: 1, rate: 1500, taxRate: 18 }],
  })).data;
  await call('POST', '/sales', token, {
    partyId: parties.both.id, invoiceDate: day(1),
    lines: [{ itemId: items.sensor.id, quantity: 5 }],
  });
  const bill1 = (await call('POST', '/purchases', token, {
    partyId: parties.globex.id, invoiceDate: day(8), dueDate: day(-6),
    lines: [{ itemId: items.sensor.id, quantity: 50 }, { itemId: items.cable.id, quantity: 40 }],
  })).data;

  console.log('Recording payments...');
  await call('POST', '/payments', token, {
    partyId: parties.acme.id, invoiceId: sale1.id, direction: 'in', amount: 5000, method: 'bank', reference: 'NEFT-88121',
  });
  await call('POST', '/payments', token, {
    partyId: parties.sunrise.id, invoiceId: sale2.id, direction: 'in', amount: sale2.total, method: 'upi',
  });
  await call('POST', '/payments', token, {
    partyId: parties.globex.id, invoiceId: bill1.id, direction: 'out', amount: 4000, method: 'cheque', reference: 'CHQ-004512',
  });

  console.log('Done. Log in as alice@companya.dev to see the billing data.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
