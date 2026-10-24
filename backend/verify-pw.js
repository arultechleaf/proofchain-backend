const bcrypt = require('bcrypt');
const Database = require('better-sqlite3');
const db = new Database('./proofchain.sqlite');
const u = db.prepare('SELECT email, password_hash FROM users').all();
Promise.all([
  bcrypt.compare('Admin@123456', u[0].password_hash).then(r => console.log('admin  Admin@123456 :', r ? '✅ MATCH' : '❌ NO')),
  bcrypt.compare('Alice@123456', u[1].password_hash).then(r => console.log('alice  Alice@123456 :', r ? '✅ MATCH' : '❌ NO')),
  bcrypt.compare('Bob@123456',   u[2].password_hash).then(r => console.log('bob    Bob@123456   :', r ? '✅ MATCH' : '❌ NO')),
  bcrypt.compare('Carol@123456', u[3].password_hash).then(r => console.log('carol  Carol@123456 :', r ? '✅ MATCH' : '❌ NO')),
]).then(() => db.close());
