function formatDate(d) { return new Date(d).toLocaleDateString() }

async function load() {
  const notes = await (await fetch('/api/notes')).json()
  document.getElementById('notes').innerHTML = notes.map(n => '<li>' + n.text + ' (' + n.english + ') <button onclick="del(' + n.id + ')">x</button></li>').join('')
}

async function addNote() {
  await fetch('/api/notes', { method: 'POST', body: JSON.stringify({ id: Date.now(), text: document.getElementById('text').value, date: new Date() }) })
  load()
}

async function del(id) {
  await fetch('/api/notes/delete', { method: 'POST', body: JSON.stringify({ id }) })
  load()
}

load()
