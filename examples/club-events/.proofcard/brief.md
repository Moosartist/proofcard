# Project brief

Design and decisions live in the project map (`.proofcard/map.json`, view it with `proofcard map view`).

## Problem
A small club organises events by group chat; nobody knows how many people are coming and places run out.

## Users
Members on their phone who want to see what's on and sign up; one organiser who needs the list of attendees.

## Success criteria
- A member can sign up in under a minute and gets a confirmation with a cancel code.
- An event never has more sign-ups than places, even when people sign up at the same moment.
- The organiser sees each event's attendees after entering the organiser key.

## Non-goals
- No accounts or passwords for members; no payments; no email yet (the reminder feature is only planned).

## Not tested / known limits
- The pages (public/*.js) have no automated browser test; the API and rules are tested.
- Only one server process may use the data file (see open debt "multi-process" on Sign up).
- Email reminders are planned, not built; the email provider is unknown.

## Run & deploy
- `npm test`; `npm run smoke` starts the real server on a free port and checks the pages and the API.
- `ORGANISER_KEY=... npm start` (PORT defaults to 3000). Data is stored in `data/db.json` (or `DATA_FILE`).
