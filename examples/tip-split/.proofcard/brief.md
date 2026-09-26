# Project brief

## Problem
At the end of a group meal someone has to split the bill plus tip. Calculator splits leave odd cents
(100.00 / 3 = 33.33 × 3 = 99.99) and people argue about who pays the extra cent.

## Users
One person at the table, on a phone browser, who types the bill, the tip % and the number of people
and reads out what each person pays.

## Success criteria
- The shares always add up exactly to bill + tip (to the cent), for 1–50 people.
- Shares differ by at most one cent; the extra cents go to the first people in the list.
- Works in a mobile browser without installing anything; the page loads with no external requests.
- Invalid input (empty, negative, 0 people) shows a message instead of a wrong number.

## Non-goals
- No accounts, no saving history, no payments.
- No per-item splitting (who ordered what) in this version.
- No currency conversion; amounts are in one currency with two decimals.

## Design
- `src/split.js`: pure function `splitBill({ billCents, tipPercent, people })` → array of shares in cents.
  Works in Node (tests) and in the browser (same file, no build step).
- `public/index.html` + `public/app.js`: form → parse input to integer cents → `splitBill` → render list.
- `server.js`: tiny static file server (Node `http`), serves `public/` and `/split.js`; `PORT` env var.
- Data flow: form input (strings) → validation → integer cents → splitBill → formatted strings. No storage,
  no network calls after page load.

## Decisions
- Integer cents everywhere: floating point money math is what causes the lost cent.
- No framework and no dependencies: one page, nothing to update or audit, instant load.
- Same `split.js` in browser and tests: the tested code is the shipped code.
- A small Node server rather than "open the HTML file": gives a real deploy target and a smoke test that
  exercises what users get.

## Not tested / known limits
- Automated: split logic (unit tests, incl. a sweep of bills × tips × 1–50 people) and an HTTP smoke test
  (page, security headers, 5 path-traversal attempts → 404).
- The page's JavaScript (`public/app.js`) has no automated test. It was checked by hand once in a desktop
  Chromium browser: 100 / 3 people, "12,5" + 10% / 4, invalid bill, 0 people, empty tip; no console errors.
  Not tried on a real phone.
- Bills above 10,000,000.00 are rejected rather than tested for precision.
- No accessibility audit beyond labelled inputs.

## Run & deploy
- `npm test` — unit tests. `npm run smoke` — starts the server on a free port and checks the page.
- `npm start` — serves on `PORT` (default 3000). Any Node 20+ host works; no build step.
