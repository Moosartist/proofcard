---
name: proofcard
description: Use when changing code in an existing project — a feature, a bug fix, a refactor — and before saying the work is done. Scales the process to the risk of the change and ends with `proofcard verify`, whose output (not your own summary) is the evidence.
---

# Proofcard workflow

Understand → shape → scope → implement small → verify for real → review the diff → report honestly.
Match effort to risk. Do not add ceremony to a small, reversible change.

## 1. Pick the risk (decide first, it sets everything else)

| Risk | Typical change | You must |
|---|---|---|
| low | copy, docs, config value, isolated one-liner, easy to revert | card with title/type/risk, run the checks |
| medium | new behaviour, bug fix, anything touching shared code | + problem, facts vs assumptions, must_not_change, scope; bug fixes need a regression test that fails before the fix |
| high | auth, payments, data migration, public API, security-sensitive input, wide refactor | + design (data flow, dependencies), security areas considered, named human reviewer |

If unsure between two levels, pick the higher one and say why.

## 2. Understand before editing (medium/high)

- Read the project's instructions (README, AGENTS.md/CLAUDE.md), the affected code path and its existing tests.
- Write down what must NOT change.
- Separate **facts** you saw (cite `file:line` or command output) from **assumptions** that still need checking.
- Bug fix: reproduce it first. Write the regression test, run it, and see it fail for the reason you expect. State the likely cause. Only then fix.
- Optional: if Whiteboard (devdotfast) is connected and the change crosses modules, draw the data flow there and link it in `design`. Never required.

## 3. Create the card

```bash
npx github:Moosartist/proofcard new "Short title" --type bugfix --risk medium
```

Fill every `TODO` in `.proofcard/changes/<slug>.json`. Keep `scope` tight: globs of the files you intend to touch.

## 4. Implement within scope

Small steps. If you find another problem, add it to a "Later" note in the card — do not fix it in this change.

## 5. Verify for real

```bash
npx github:Moosartist/proofcard verify
```

- Exit 0 = PASS, 1 = FAIL, 2 = INCOMPLETE. Only exit 0 may be reported as PASS.
- On FAIL: fix the cause, not the check. Never delete or weaken a test to get PASS, and never edit the report.
- If a check cannot run here (missing service, credentials, paid API), leave it NOT_RUN and say why.

## 6. Review your own diff

Run `git diff` and look for: changes outside the task, debugging leftovers, secrets, unhandled cases (empty, null, error paths), needless complexity. Fix or record them.

## 7. Report

Paste the report table from `.proofcard/reports/<slug>.md` as-is, then add:
- what changed and why (2–4 lines),
- anything NOT_RUN and why,
- known limits and "Later" items.

Never write "secure", "bug-free" or "fully tested". Passing checks prove only what the checks exercise.
