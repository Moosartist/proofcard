'use strict';
// HTTP only: routes, input parsing and status codes. Rules live in src/events.js, data in src/store.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createStore } = require('./src/store');
const { createEvents, RuleError } = require('./src/events');

const PAGES = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/organiser': ['public/organiser.html', 'text/html; charset=utf-8'],
  '/organiser.js': ['public/organiser.js', 'text/javascript; charset=utf-8'],
};

const HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'" };

function send(res, status, body) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new RuleError(413, 'Request too large.')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new RuleError(400, 'Invalid JSON.')); }
    });
  });
}

function organiserOnly(req) {
  const key = process.env.ORGANISER_KEY;
  if (!key) throw new RuleError(503, 'Organiser key is not configured on the server.');
  if (req.headers['x-organiser-key'] !== key) throw new RuleError(401, 'Wrong organiser key.');
}

function createServer({ store = createStore(), now } = {}) {
  const events = createEvents(store, now);
  const API = {
    'GET /api/events': async () => events.listEvents(),
    'POST /api/events/:id/signups': async (req, id) => events.signUp(id, await readJson(req)),
    'POST /api/events/:id/cancellations': async (req, id) => events.cancel(id, await readJson(req)),
    'GET /api/events/:id/signups': async (req, id) => { organiserOnly(req); return events.attendees(id); },
  };

  return http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    const page = req.method === 'GET' && PAGES[url];
    if (page) {
      res.writeHead(200, { ...HEADERS, 'Content-Type': page[1] });
      return fs.createReadStream(path.join(__dirname, page[0])).pipe(res);
    }
    const m = /^\/api\/events\/([\w-]+)\/(signups|cancellations)$/.exec(url);
    const key = m ? `${req.method} /api/events/:id/${m[2]}` : `${req.method} ${url}`;
    const handler = API[key];
    if (!handler) return send(res, 404, { error: 'Not found' });
    try {
      send(res, key === 'POST /api/events/:id/signups' ? 201 : 200, await handler(req, m && m[1]));
    } catch (e) {
      if (e instanceof RuleError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Something went wrong.' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`club-events on http://localhost:${port}`));
}

module.exports = { createServer };
