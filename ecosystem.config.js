// pm2 process file for local IIS hosting (see docs/iis-local-hosting.md).
// IIS listens on port 80 and forwards requests to these two Node processes.
//
//   pm2 start ecosystem.config.js     start both
//   pm2 restart all                   after a new build
//   pm2 logs                          see output / errors
//   pm2 save                          remember the list for `pm2 resurrect`
const path = require('path');

module.exports = {
  apps: [
    {
      // NestJS API. Reads .env.local then .env from this folder.
      name: 'proofchain-backend',
      cwd: __dirname,
      script: 'dist/main.js',
      env: { PORT: '3002' },
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      // Next.js frontend (production build). Reads frontend/.env.
      name: 'proofchain-frontend',
      cwd: path.join(__dirname, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
