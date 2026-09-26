'use strict';
const crypto = require('crypto');
// Business rules for events and sign-ups. Knows nothing about HTTP or files.

class RuleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createEvents(store, now = () => new Date()) {
  const taken = (db, eventId) => db.signups.filter((s) => s.eventId === eventId).length;
  const today = () => { const d = now(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

  async function listEvents() {
    const db = await store.load();
    return db.events
      .filter((e) => new Date(e.date) >= today())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({ ...e, placesLeft: e.capacity - taken(db, e.id) }));
  }

  async function signUp(eventId, input) {
    const name = String((input && input.name) || '').trim();
    const email = String((input && input.email) || '').trim().toLowerCase();
    if (!name || name.length > 80) throw new RuleError(400, 'Please enter your name (up to 80 characters).');
    if (!EMAIL.test(email)) throw new RuleError(400, 'Please enter a valid email address.');
    return store.update((db) => {
      const event = db.events.find((e) => e.id === eventId);
      if (!event) throw new RuleError(404, 'This event does not exist.');
      if (db.signups.some((s) => s.eventId === eventId && s.email === email)) throw new RuleError(409, 'You are already signed up for this event.');
      if (taken(db, eventId) >= event.capacity) throw new RuleError(409, 'Sorry, this event is full.');
      const code = crypto.randomBytes(4).toString('hex');
      db.signups.push({ eventId, name, email, code, at: now().toISOString() });
      return { placesLeft: event.capacity - taken(db, eventId), cancelCode: code };
    });
  }

  async function cancel(eventId, input) {
    const email = String((input && input.email) || '').trim().toLowerCase();
    const code = String((input && input.code) || '').trim();
    return store.update((db) => {
      const i = db.signups.findIndex((s) => s.eventId === eventId && s.email === email && s.code === code);
      if (i < 0) throw new RuleError(404, 'No sign-up matches this event, email and code.');
      db.signups.splice(i, 1);
      return { cancelled: true };
    });
  }

  async function attendees(eventId) {
    const db = await store.load();
    if (!db.events.some((e) => e.id === eventId)) throw new RuleError(404, 'This event does not exist.');
    return db.signups.filter((s) => s.eventId === eventId).map(({ name, email, at }) => ({ name, email, at }));
  }

  return { listEvents, signUp, cancel, attendees };
}

module.exports = { createEvents, RuleError };
