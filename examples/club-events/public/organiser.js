'use strict';
// Organiser page: asks the API for each event's attendees using the organiser key.

async function loadAttendees(key) {
  const lists = document.getElementById('lists');
  const message = document.getElementById('message');
  lists.textContent = '';
  message.textContent = '';
  const events = await (await fetch('/api/events')).json();
  for (const ev of events) {
    const res = await fetch(`/api/events/${encodeURIComponent(ev.id)}/signups`, { headers: { 'X-Organiser-Key': key } });
    const data = await res.json();
    if (!res.ok) { message.textContent = data.error; return; }
    const h = document.createElement('h2');
    h.textContent = `${ev.title} (${data.length})`;
    const ul = document.createElement('ul');
    for (const a of data) {
      const li = document.createElement('li');
      li.textContent = `${a.name} <${a.email}>`;
      ul.appendChild(li);
    }
    lists.append(h, ul);
  }
}

document.getElementById('auth').addEventListener('submit', (e) => {
  e.preventDefault();
  loadAttendees(document.getElementById('key').value);
});
