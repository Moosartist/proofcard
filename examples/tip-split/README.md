# tip-split

Split a bill plus tip between people so the shares add up exactly to the cent.
100.00 between 3 people gives 33.34, 33.33, 33.33, never 99.99.

This project is the complete worked example for [Proofcard](https://github.com/Moosartist/proofcard):
it was built from an idea through the brief → change cards → verify → ready path. Start with
[`.proofcard/brief.md`](.proofcard/brief.md) to see what it is and why it's built this way.

## Run

Needs Node 20+. No dependencies to install.

```bash
npm test          # unit tests for the split logic
npm run smoke     # starts the server on a free port and checks pages, headers and path traversal
npm start         # http://localhost:3000 (set PORT to change)
```

## Deploy

Any host that runs Node 20+: start command `npm start`, port from `PORT`. There is no build step.

## Release status

Run `npx github:Moosartist/proofcard ready`. The web server change is high risk (URL paths reach the
filesystem), so the release stays INCOMPLETE until a person reviews `server.js` and fills in `review`
in `.proofcard/changes/web-page-and-server.json`. Proofcard records that as a declaration; it doesn't verify it.

## License

MIT
