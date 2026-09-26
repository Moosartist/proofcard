---
name: proofcard
description: Use when building or changing a tool or website with an AI assistant — starting from an idea, adding a feature, fixing a bug, or preparing a release. One path: brief → change cards → verify → ready. Scales process to risk; the verdicts come from `proofcard verify` / `proofcard ready` output, never from your own summary.
---

# Proofcard path

```
idea / existing repo
  → brief (once; update when the design changes)      .proofcard/brief.md
  → one change at a time: card → build → verify       proofcard new / proofcard verify
  → release: ready                                    proofcard ready
```

Match effort to risk. Don't add ceremony to a small, reversible change.
Commands: `npx github:Moosartist/proofcard <init|new|verify|ready>`.

## 0. Setup (once per repo)

`proofcard init --claude` → `proofcard.json` (checks) + `.proofcard/brief.md`. Commit setup on its own.
Add a `"smoke"` command to `proofcard.json` that starts the real thing and checks it answers
(build + start + request the main page, or run the CLI on a sample input).

## 1. Brief (before building anything new)

Fill every section of `.proofcard/brief.md` with the user: Problem, Users, Success criteria (observable),
Non-goals, Design (parts + data flow + dependencies), Decisions (each with its reason), Not tested / known limits,
Run & deploy. Keep it one page. Ask the user only what you can't infer; propose defaults.
For an existing repo, write it from what the code actually does (cite files), and mark guesses as assumptions.
If Whiteboard (devdotfast) is connected and the design crosses modules, drawing it there is optional.

Slice the work into changes that can each be verified on their own (logic first, then UI/server, then docs).

## 2. Each change: pick the risk

| Risk | Typical change | You must |
|---|---|---|
| low | copy, docs, config value, isolated one-liner, easy to revert | card with title/type/risk, run the checks |
| medium | new behaviour, bug fix, anything touching shared code | + problem, facts vs assumptions, must_not_change, scope; bug fixes need a regression test that fails before the fix |
| high | auth, payments, data, public API, untrusted input reaching files/DB/shell, wide refactor | + design, security areas considered, review attestation (the reviewer's name and notes; Proofcard does not verify it — never fill it in yourself, never present it as proof of review) |

If unsure between two levels, pick the higher one and say why.

## 3. Understand before editing (medium/high)

- Read the project's instructions, the affected code path and its existing tests.
- Write down what must NOT change.
- Separate **facts** (cite `file:line` or command output) from **assumptions**.
- Bug fix: reproduce first. Write the regression test, see it fail for the expected reason, state the likely cause, then fix.

## 4. Card → build → verify

```bash
npx github:Moosartist/proofcard new "Short title" --type feature --risk medium
# fill every TODO, keep scope tight, build in small steps
npx github:Moosartist/proofcard verify
```

- Exit 0 = PASS, 1 = FAIL, 2 = INCOMPLETE. Only exit 0 may be reported as PASS.
- On FAIL: fix the cause, not the check. Never weaken a test or edit a report.
- Confirm tests actually ran (a runner that finds no tests exits 0).
- Side issues go into the card's `later` list, not into this change.
- Anything you checked by hand (e.g. clicking through a page) goes into the brief's "Not tested / known limits"
  as a manual check, with what exactly you tried. It is not automated evidence.

## 5. Review your own diff

`git diff`: unrelated changes, debugging leftovers, secrets, unhandled cases (empty, invalid, error paths), needless complexity.

## 6. Release: ready

Update the brief (especially "Not tested / known limits"), commit, then:

```bash
npx github:Moosartist/proofcard ready
```

READY (0) / NOT_READY (1) / INCOMPLETE (2). It checks the brief, clean committed state, review attestations for
high-risk cards, secrets in the whole repo, project checks, smoke, production dependency audit, README.
A high-risk change stays INCOMPLETE until **the user** reviews it and fills `review` in its card.

## 7. Report to the user

Paste the verdict and evidence table from `.proofcard/reports/ready.md` (or the change report), then:
what was built and why (2–4 lines), what is NOT_RUN or untested and why, what the user must do next
(e.g. review `server.js`). Never write "secure", "bug-free" or "fully tested".
