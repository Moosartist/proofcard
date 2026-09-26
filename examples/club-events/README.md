# club-events

Members see upcoming club events and sign up; the organiser sees who is coming.
This is the worked example for the [Proofcard](https://github.com/Moosartist/proofcard) project map:
it was planned, built, extended and fixed through the map. Start with the map:

```bash
npx github:Moosartist/proofcard map view   # then open .proofcard/map.html
```

## Run

Node 20+, no dependencies.

```bash
npm test
npm run smoke
ORGANISER_KEY=choose-one npm start      # http://localhost:3000 and /organiser
```
