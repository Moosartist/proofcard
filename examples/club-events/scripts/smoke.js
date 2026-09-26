'use strict';
// Starts the real server with a temporary data file and checks what a visitor gets.
const fs = require('fs');
const os = require('os');
const path = require('path');

(async () => {
  process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'club-smoke-')), 'db.json');
  fs.writeFileSync(process.env.DATA_FILE, JSON.stringify({ events: [{ id: 'demo', title: 'Demo', date: '2999-01-01', place: 'Here', capacity: 1 }], signups: [] }));
  const { createServer } = require('../server');
  const server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const checks = [
    ['home page', async () => (await (await fetch(base + '/')).text()).includes('Upcoming club events')],
    ['organiser page', async () => (await fetch(base + '/organiser')).status === 200],
    ['events API', async () => (await (await fetch(base + '/api/events')).json())[0].id === 'demo'],
    ['sign-up API', async () => (await fetch(base + '/api/events/demo/signups', { method: 'POST', body: JSON.stringify({ name: 'S', email: 's@x.org' }) })).status === 201],
  ];
  let failed = 0;
  for (const [name, fn] of checks) {
    const ok = await fn().catch(() => false);
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    if (!ok) failed++;
  }
  // Let open connections finish instead of process.exit(), which crashed on Windows while sockets were closing.
  server.closeAllConnections();
  server.close();
  process.exitCode = failed ? 1 : 0;
})();
