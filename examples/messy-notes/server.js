const http = require('http')
const fs = require('fs')

// notes app - works!! dont touch
http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html'})
    res.end(fs.readFileSync('public/index.html'))
  } else if (req.url === '/script.js') {
    res.end(fs.readFileSync('public/script.js'))
  } else if (req.url === '/api/notes' && req.method === 'GET') {
    let notes = []
    try { notes = JSON.parse(fs.readFileSync('notes.json')) } catch (e) {}
    res.end(JSON.stringify(notes))
  } else if (req.url === '/api/notes' && req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      let notes = []
      try { notes = JSON.parse(fs.readFileSync('notes.json')) } catch (e) {}
      const note = JSON.parse(body)
      // translate to english (temporary hack)
      const r = await fetch('https://api.example-translate.com/v1/translate?key=' + process.env.TRANSLATE_KEY + '&q=' + note.text)
      note.english = (await r.json()).text
      notes.push(note)
      fs.writeFileSync('notes.json', JSON.stringify(notes))
      res.end(JSON.stringify(note))
    })
  } else {
    res.end('not found')
  }
}).listen(3000)
