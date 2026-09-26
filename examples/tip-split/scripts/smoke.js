'use strict';
// Starts the real server on a free port and checks what a user (or an attacker) would get.
const http = require('http');
const { createServer } = require('../server');

const get = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

(async () => {
  const server = createServer().listen(0);
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address();
  const failures = [];
  const expect = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };
  try {
    const home = await get(port, '/');
    expect(home.status === 200 && home.body.includes('Split the bill'), 'GET / serves the page');
    expect(home.headers['x-content-type-options'] === 'nosniff', 'nosniff header present');
    expect(/default-src 'self'/.test(home.headers['content-security-policy'] || ''), 'CSP header present');
    const split = await get(port, '/split.js');
    expect(split.status === 200 && split.body.includes('function splitBill'), 'GET /split.js serves the shared logic');
    expect((await get(port, '/app.js')).status === 200, 'GET /app.js');
    for (const p of ['/../package.json', '/%2e%2e/package.json', '/public/../server.js', '/server.js', '/.proofcard/brief.md']) {
      expect((await get(port, p)).status === 404, `GET ${p} is 404`);
    }
  } finally {
    server.close();
  }
  if (failures.length) { console.error(`${failures.length} smoke check(s) failed`); process.exit(1); }
  console.log('smoke ok');
})().catch((e) => { console.error(e); process.exit(1); });
