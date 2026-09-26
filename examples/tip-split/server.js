'use strict';
// Minimal static server. Only the paths in ROUTES are ever read from disk.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROUTES = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/split.js': ['src/split.js', 'text/javascript; charset=utf-8'],
};

const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'no-referrer',
};

function createServer() {
  return http.createServer((req, res) => {
    const route = req.method === 'GET' ? ROUTES[req.url.split('?')[0]] : undefined;
    if (!route) {
      res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    fs.readFile(path.join(__dirname, route[0]), (err, body) => {
      if (err) {
        res.writeHead(500, { ...HEADERS, 'Content-Type': 'text/plain' });
        return res.end('Server error');
      }
      res.writeHead(200, { ...HEADERS, 'Content-Type': route[1] });
      res.end(body);
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log(`tip-split on http://localhost:${port}`));
}

module.exports = { createServer };
