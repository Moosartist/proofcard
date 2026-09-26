'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createEvents } = require('../src/events');
const { tempStore, now } = require('./helpers');

test('lists only upcoming events, soonest first, with places left', async () => {
  const events = createEvents(await tempStore([{ eventId: 'quiz', name: 'A', email: 'a@x.org' }]), now);
  const list = await events.listEvents();
  assert.deepStrictEqual(list.map((e) => [e.id, e.placesLeft]), [['walk', 30], ['quiz', 1]]);
});

test('sign-up is saved and reduces places left', async () => {
  const store = await tempStore();
  const events = createEvents(store, now);
  const r = await events.signUp('quiz', { name: 'Sam', email: 'Sam@Example.org' });
  assert.strictEqual(r.placesLeft, 1);
  assert.match(r.cancelCode, /^[0-9a-f]{8}$/);
  assert.deepStrictEqual((await store.load()).signups.map((s) => s.email), ['sam@example.org']);
});

test('sign-up rejects bad input, duplicates, unknown and full events', async () => {
  const events = createEvents(await tempStore(), now);
  await assert.rejects(events.signUp('quiz', { name: '', email: 'a@x.org' }), { status: 400 });
  await assert.rejects(events.signUp('quiz', { name: 'A', email: 'nope' }), { status: 400 });
  await assert.rejects(events.signUp('nope', { name: 'A', email: 'a@x.org' }), { status: 404 });
  await events.signUp('quiz', { name: 'A', email: 'a@x.org' });
  await assert.rejects(events.signUp('quiz', { name: 'A2', email: 'A@X.org' }), { status: 409, message: /already signed up/ });
  await events.signUp('quiz', { name: 'B', email: 'b@x.org' });
  await assert.rejects(events.signUp('quiz', { name: 'C', email: 'c@x.org' }), { status: 409, message: /full/ });
});

test('cancel with the right email and code frees the place', async () => {
  const events = createEvents(await tempStore(), now);
  const { cancelCode } = await events.signUp('quiz', { name: 'A', email: 'a@x.org' });
  await assert.rejects(events.cancel('quiz', { email: 'a@x.org', code: 'wrong' }), { status: 404 });
  await assert.rejects(events.cancel('quiz', { email: 'b@x.org', code: cancelCode }), { status: 404 });
  assert.deepStrictEqual(await events.cancel('quiz', { email: 'A@x.org', code: cancelCode }), { cancelled: true });
  assert.strictEqual((await events.listEvents()).find((e) => e.id === 'quiz').placesLeft, 2);
});

test('attendee list for one event', async () => {
  const events = createEvents(await tempStore([{ eventId: 'walk', name: 'A', email: 'a@x.org', at: 't' }]), now);
  assert.deepStrictEqual(await events.attendees('walk'), [{ name: 'A', email: 'a@x.org', at: 't' }]);
  await assert.rejects(events.attendees('nope'), { status: 404 });
});
