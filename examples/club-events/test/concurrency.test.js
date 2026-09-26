'use strict';
// Regression: sign-ups arriving at the same moment must all be kept (debt "concurrent-writes").
const test = require('node:test');
const assert = require('node:assert');
const { createEvents } = require('../src/events');
const { tempStore, now } = require('./helpers');

test('20 simultaneous sign-ups are all saved', async () => {
  const store = await tempStore();
  const events = createEvents(store, now);
  await Promise.all(Array.from({ length: 20 }, (_, i) => events.signUp('walk', { name: `P${i}`, email: `p${i}@x.org` })));
  assert.strictEqual((await events.attendees('walk')).length, 20);
});

test('sign-ups and cancellations at the same moment do not undo each other', async () => {
  const store = await tempStore();
  const events = createEvents(store, now);
  const first = await Promise.all(Array.from({ length: 5 }, (_, i) => events.signUp('walk', { name: `A${i}`, email: `a${i}@x.org` })));
  await Promise.all([
    ...first.map((r, i) => events.cancel('walk', { email: `a${i}@x.org`, code: r.cancelCode })),
    ...Array.from({ length: 5 }, (_, i) => events.signUp('walk', { name: `B${i}`, email: `b${i}@x.org` })),
  ]);
  assert.deepStrictEqual((await events.attendees('walk')).map((a) => a.name).sort(), ['B0', 'B1', 'B2', 'B3', 'B4']);
});
