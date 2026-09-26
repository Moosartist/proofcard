function formatDate(d) { return d.toISOString().slice(0, 10) }
function saveNotes(notes) { require('fs').writeFileSync('notes-backup.json', JSON.stringify(notes)) }
module.exports = { formatDate, saveNotes }
