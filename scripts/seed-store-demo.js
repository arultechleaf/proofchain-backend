/**
 * Namma Store demo data: one shop owner, one open shop and a dozen grocery products (some with pack prices),
 * so the mobile app has something to show. Safe to run again: it does nothing when the demo owner already exists.
 *
 *   node scripts/seed-store-demo.js            (the backend must be running)
 *   API_URL=http://localhost:3002/api node scripts/seed-store-demo.js
 */
const path = require('path');
require(path.join(__dirname, '..', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'));

const API = process.env.API_URL || `http://localhost:${process.env.APP_PORT || 3002}/api`;
const OWNER_EMAIL = 'demo.owner@namma.store';
const OWNER_PASSWORD = 'Demo@1234';

/** name, Tamil name, category, unit, price per unit, MRP, stock, packs [label, qty, price] */
const PRODUCTS = [
  ['Ponni Rice', 'பொன்னி அரிசி', 'Groceries', 'kg', 62, 70, 200, [['250 g', 0.25, 16], ['500 g', 0.5, 31], ['1 kg', 1, 62], ['5 kg', 5, 310]]],
  ['Toor Dal', 'துவரம் பருப்பு', 'Groceries', 'kg', 140, 155, 80, [['250 g', 0.25, 36], ['500 g', 0.5, 70], ['1 kg', 1, 140]]],
  ['Sunflower Oil', 'சூரியகாந்தி எண்ணெய்', 'Groceries', 'litre', 150, 165, 60, [['500 ml', 0.5, 76], ['1 L', 1, 150]]],
  ['Sugar', 'சர்க்கரை', 'Groceries', 'kg', 46, 50, 120, [['500 g', 0.5, 23], ['1 kg', 1, 46]]],
  ['Iodised Salt', 'அயோடின் உப்பு', 'Groceries', 'packet', 24, 28, 100, []],
  ['Tomato', 'தக்காளி', 'Fruits & Vegetables', 'kg', 40, 40, 50, [['250 g', 0.25, 10], ['500 g', 0.5, 20], ['1 kg', 1, 40]]],
  ['Onion', 'வெங்காயம்', 'Fruits & Vegetables', 'kg', 35, 38, 70, [['500 g', 0.5, 18], ['1 kg', 1, 35]]],
  ['Banana', 'வாழைப்பழம்', 'Fruits & Vegetables', 'kg', 60, 65, 30, []],
  ['Full Cream Milk', 'பால்', 'Dairy & Eggs', 'packet', 34, 34, 90, []],
  ['Farm Eggs', 'முட்டை', 'Dairy & Eggs', 'piece', 7, 7, 300, []],
  ['Curd', 'தயிர்', 'Dairy & Eggs', 'packet', 30, 32, 60, []],
  ['Tea Powder', 'தேயிலை தூள்', 'Beverages', 'packet', 120, 130, 40, []],
  ['Good Day Biscuits', 'பிஸ்கட்', 'Snacks', 'packet', 10, 10, 150, []],
  ['Potato Chips', 'உருளைக்கிழங்கு சிப்ஸ்', 'Snacks', 'packet', 20, 20, 80, []],
  ['Bath Soap', 'குளியல் சோப்பு', 'Personal Care', 'piece', 38, 42, 70, []],
];

const call = async (method, url, token, body) => {
  const res = await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
};

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USERNAME || process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS, database: process.env.DB_DATABASE || process.env.DB_NAME,
  });
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [OWNER_EMAIL]);
    if (existing.length) {
      console.log('The demo owner already exists, nothing to do.');
      return;
    }
    // sign-up needs a verified email code; mark this one as verified, as if it had been typed
    await db.query('DELETE FROM email_otps WHERE email = ?', [OWNER_EMAIL]);
    await db.query(
      "INSERT INTO email_otps (account_type,email,code_hash,expires_at,sent_at,verified_at,attempts) VALUES ('general',?,?,DATE_ADD(NOW(),INTERVAL 10 MINUTE),NOW(),NOW(),0)",
      [OWNER_EMAIL, 'x'.repeat(64)],
    );
    await call('POST', '/store/auth/register-owner', null, {
      name: 'Murugan', email: OWNER_EMAIL, mobile: '9000000001', password: OWNER_PASSWORD,
      shopName: 'Murugan Mart', shopAddress: '12, Gandhi Street, Anna Nagar', city: 'Chennai', pincode: '600040',
    });
    const { accessToken } = await call('POST', '/auth/login', null, { email: OWNER_EMAIL, password: OWNER_PASSWORD });
    await call('PATCH', '/store/owner/shop', accessToken, {
      description: 'Fresh groceries, vegetables and dairy for your family.', phone: '9000000001',
      isOpen: true, deliveryFee: 25, freeDeliveryAbove: 500, minOrder: 100,
    });
    const cats = await call('GET', '/store/categories');
    const catId = (name) => cats.find((c) => c.name === name)?.id;
    let n = 0;
    for (const [name, nameTa, cat, unit, price, mrp, stock, packs] of PRODUCTS) {
      await call('POST', '/store/owner/products', accessToken, {
        name, nameTa, categoryId: catId(cat), unit, price, mrp, stock, lowStockLevel: 10,
        description: `${name} from Murugan Mart.`,
        packs: packs.map(([label, qty, p]) => ({ label, qty, price: p })),
      });
      n += 1;
    }
    console.log(`Created shop "Murugan Mart" with ${n} products.`);
    console.log(`Owner login:  ${OWNER_EMAIL}  /  ${OWNER_PASSWORD}`);
  } finally {
    await db.end();
  }
})().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
