'use strict';
// Starts the real server and talks to it over HTTP, like the browser does.
const test = require('node:test');
const assert = require('node:assert');
const { createServer } = require('../server');
const { tempStore, now } = require('./helpers');

async function start() {
  const server = createServer({ store: await tempStore(), now }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (p, opts = {}) => {
    const res = await fetch(base + p, opts);
    return { status: res.status, body: res.headers.get('content-type').includes('json') ? await res.json() : await res.text() };
  };
  return { server, call };
}

test('GET /api/events returns upcoming events', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());
  const r = await call('/api/events');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.body.map((e) => e.id), ['walk', 'quiz']);
});

test('POST /api/events/:id/signups signs up and reports errors as JSON', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());
  const post = (id, body) => call(`/api/events/${id}/signups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const first = await post('quiz', JSON.stringify({ name: 'Sam', email: 'sam@x.org' }));
  assert.strictEqual(first.status, 201);
  assert.strictEqual(first.body.placesLeft, 1);
  assert.strictEqual((await post('quiz', JSON.stringify({ name: 'Sam', email: 'sam@x.org' }))).status, 409);
  assert.strictEqual((await post('quiz', '{bad json')).status, 400);
  assert.strictEqual((await post('nope', JSON.stringify({ name: 'A', email: 'a@x.org' }))).status, 404);
});

test('POST /api/events/:id/cancellations cancels with the code from sign-up', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());
  const json = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const { body } = await call('/api/events/walk/signups', json({ name: 'A', email: 'a@x.org' }));
  assert.match(body.cancelCode, /^[0-9a-f]{8}$/);
  assert.strictEqual((await call('/api/events/walk/cancellations', json({ email: 'a@x.org', code: 'nope' }))).status, 404);
  assert.deepStrictEqual(await call('/api/events/walk/cancellations', json({ email: 'a@x.org', code: body.cancelCode })), { status: 200, body: { cancelled: true } });
});

test('GET /api/events/:id/signups needs the organiser key', async (t) => {
  process.env.ORGANISER_KEY = 'test-key';
  const { server, call } = await start();
  t.after(() => { server.close(); delete process.env.ORGANISER_KEY; });
  assert.strictEqual((await call('/api/events/walk/signups')).status, 401);
  const ok = await call('/api/events/walk/signups', { headers: { 'X-Organiser-Key': 'test-key' } });
  assert.deepStrictEqual(ok, { status: 200, body: [] });
});

test('pages are served and unknown paths are 404', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());
  assert.match((await call('/')).body, /Upcoming club events/);
  assert.match((await call('/organiser')).body, /Organiser key/);
  assert.strictEqual((await call('/../package.json')).status, 404);
  assert.strictEqual((await call('/data/db.json')).status, 404);
});
