// Runs before `npm run start:dev`. If the API port is already taken, a backend is already
// running (usually another terminal's watcher), and starting a second one only makes both
// restart and crash with EADDRINUSE on every file change. Refuse instead.
require('dotenv').config({ quiet: true });
const net = require('net');

const port = Number(process.env.APP_PORT || 3001);
const probe = net.createServer();

probe.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${port} is already in use: the backend is already running.`);
    console.error('Use that terminal, or stop it first, so only one `start:dev` runs.\n');
    process.exit(1);
  }
  throw err;
});
probe.once('listening', () => probe.close());
probe.listen(port);
