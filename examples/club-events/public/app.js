'use strict';
// Home page: shows events and sends sign-ups. No business rules here; the server decides.

const message = document.getElementById('message');

async function loadEvents() {
  const res = await fetch('/api/events');
  const events = await res.json();
  const list = document.getElementById('events');
  list.textContent = events.length ? '' : 'No upcoming events.';
  const select = document.querySelector('#cancel select');
  select.textContent = '';
  for (const ev of events) select.add(new Option(ev.title, ev.id));
  for (const ev of events) {
    const node = document.getElementById('event-template').content.cloneNode(true);
    node.querySelector('.title').textContent = ev.title;
    node.querySelector('.when').textContent = `${ev.date} · ${ev.place}`;
    node.querySelector('.places').textContent = ev.placesLeft > 0 ? `${ev.placesLeft} place(s) left` : 'Full';
    node.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); signUp(ev.id, e.target); });
    list.appendChild(node);
  }
}

async function signUp(eventId, form) {
  const body = { name: form.name.value, email: form.email.value };
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/signups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  message.textContent = res.ok ? `You are signed up. Keep this cancel code: ${data.cancelCode}` : data.error;
  if (res.ok) loadEvents();
}

async function cancelSignUp(form) {
  const res = await fetch(`/api/events/${encodeURIComponent(form.event.value)}/cancellations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: form.email.value, code: form.code.value }),
  });
  const data = await res.json();
  message.textContent = res.ok ? 'Your place is cancelled.' : data.error;
  if (res.ok) loadEvents();
}

document.getElementById('cancel').addEventListener('submit', (e) => { e.preventDefault(); cancelSignUp(e.target); });

loadEvents().catch(() => { message.textContent = 'Could not load events.'; });
