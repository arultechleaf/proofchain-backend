const Database = require('better-sqlite3');
const db = new Database('./proofchain.sqlite');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables.map(t => t.name).join(', '));
try {
  const users = db.prepare('SELECT email, passwordHash FROM users').all();
  console.log(JSON.stringify(users, null, 2));
} catch(e) {
  try {
    const users = db.prepare('SELECT email, password_hash FROM users').all();
    console.log(JSON.stringify(users, null, 2));
  } catch(e2) {
    const cols = db.prepare("PRAGMA table_info(users)").all();
    console.log('Columns:', JSON.stringify(cols));
  }
}
db.close();
