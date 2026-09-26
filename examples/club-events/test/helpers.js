'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/store');

const EVENTS = [
  { id: 'quiz', title: 'Quiz night', date: '2030-05-01', place: 'Club house', capacity: 2 },
  { id: 'walk', title: 'Spring walk', date: '2030-04-10', place: 'North gate', capacity: 30 },
  { id: 'old', title: 'Last year party', date: '2020-01-01', place: 'Club house', capacity: 10 },
];

async function tempStore(signups = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'club-'));
  const store = createStore(path.join(dir, 'db.json'));
  await store.update((db) => { db.events = EVENTS; db.signups = signups; });
  return store;
}

module.exports = { tempStore, EVENTS, now: () => new Date('2030-01-01T12:00:00Z') };
