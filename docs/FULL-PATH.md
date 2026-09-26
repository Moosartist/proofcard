# Full path, worked example: tip-split

This is a record of building [`examples/tip-split`](../examples/tip-split) from an idea with Proofcard, the way an AI assistant following the skill would do it (Windows, Node 24, 2026-09-26).
Outputs are real. Tables are trimmed to the verdict and table lines. The same results are re-checked on every CI build by [`test/ready.test.js`](../test/ready.test.js).

**Idea:** a small web page that splits a restaurant bill plus tip between N people so the shares add up exactly to the cent.

## 0. Setup

```text
$ proofcard init --claude
✓ wrote proofcard.json with 1 check(s): test
✓ wrote .proofcard/brief.md — fill it in before building (proofcard ready checks it)
✓ added .proofcard/reports/ to .gitignore
✓ installed Claude Code skill at .claude/skills/proofcard/SKILL.md
```

`ready` on the empty project refuses and says why:

```text
# Release readiness: NOT_READY
| project brief | FAIL | empty or TODO: Problem, Users, Success criteria, Non-goals, Design, Decisions, Not tested / known limits, Run & deploy |
| committed state | FAIL | no commits yet |
| smoke check | NOT_RUN | no "smoke" command in proofcard.json (e.g. build, start, request the main page) |
| README | FAIL | no README |
```

## 1. Brief (before any code)

[`.proofcard/brief.md`](../examples/tip-split/.proofcard/brief.md) covers the problem (the lost cent), users, observable success criteria ("shares always add up exactly… for 1–50 people"), non-goals, design (pure `splitBill` shared by browser and tests, a static server with an allow-list), and decisions with reasons (integer cents; no dependencies). Committed on its own.

The work was split into three independently verifiable changes: logic → page and server → docs.

## 2. Change 1: logic (medium risk)

Card scope: `src/split.js`, `test/split.test.js`. The tests include a sweep over bills × tips × 1–50 people asserting the exact sum and a spread of at most one cent.

```text
# Proofcard: PASS
| change card | PASS | complete for medium risk |
| scope | PASS | 2 changed file(s), all inside scope |
| secret scan (added lines) | PASS | ... |
| check: test | PASS | `npm test` exited 0 |
```

The test count was checked separately (`ℹ tests 4 / pass 4`), because a runner that finds no tests also exits 0.

## 3. Change 2: page and server (high risk)

URL paths reach the filesystem, which counts as untrusted input, so the card is **high** risk. `design` describes the allow-list routing; `security` names ASVS V12/V14 and how they're covered. A smoke test starts the real server and checks the page, the headers, and five path-traversal attempts (all 404). `"smoke": "npm run smoke"` is added to `proofcard.json`.

```text
# Proofcard: INCOMPLETE
| change card | PASS | complete for high risk |
| scope | PASS | 6 changed file(s), all inside scope |
| check: test | PASS | `npm test` exited 0 |
| review attestation (unverified) | NOT_RUN | high risk: review.reviewer and review.notes are empty |
```

The assistant does not fill in the review. That's for the person who actually reads `server.js`.

The page JavaScript has no automated test, so it was checked by hand in a desktop Chromium browser: 100/3 → 33.34, 33.33, 33.33; "12,5" + 10% / 4 → 3.44, 3.44, 3.44, 3.43; invalid bill and 0 people show messages; no console errors (so the CSP doesn't block the page). This is written into the brief as a **manual** check, not presented as automated evidence.

## 4. Change 3: README, license, test notes (low risk)

Only three evidence rows, with no design or scope ritual:

```text
# Proofcard: PASS
| change card | PASS | complete for low risk |
| secret scan (added lines) | PASS | ... |
| check: test | PASS | `npm test` exited 0 |
```

## 5. Ready

```text
# Release readiness: INCOMPLETE
## What this is          ← first paragraph of Problem, plus Users
## Key decisions         ← from the brief
## Changes               ← one row per card, with risk
| project brief | PASS | all sections filled |
| committed state | PASS | working tree clean |
| review attestations (unverified) | NOT_RUN | high-risk change(s) with no review attestation: Web page and static server |
| secret scan (whole repo) | PASS | 17 tracked file(s), ... |
| check: test | PASS | `npm test` exited 0 |
| smoke check | PASS | `npm run smoke` exited 0 |
| dependency audit | PASS | no production dependencies |
| README | PASS | README.md has run/install instructions |
| LICENSE (optional) | PASS | LICENSE |
## Not tested / known limits   ← from the brief, including the manual browser check
```

This is the honest end state: everything that can be checked mechanically passed, and the release waits for one human action. After someone reviews `server.js` and commits the `review` fields, `ready` returns **READY** (proven in `test/ready.test.js` with a test reviewer; the published example deliberately has no fake review).

## What the trial run found in Proofcard, and what was fixed

| Found | Fix |
|---|---|
| `ready` crashed on a repo with no commits, which is exactly where "start from an idea" begins | reported as `committed state: FAIL — no commits yet`; regression test added |
| `ready` ignored cards, so a high-risk change without a review could still end up READY | `review attestations (unverified)` is required whenever a high-risk card exists; test added |
| A test runner that finds zero tests exits 0, so `check: test` said PASS on an empty project | not fixed in code (Proofcard can't see inside commands); documented as a limit, and the skill now tells the assistant to confirm tests actually ran |
