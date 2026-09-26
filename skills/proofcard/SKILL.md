---
name: proofcard
description: Use for any work on a tool or website — a new idea, a feature, a fix, a refactor, returning to old code, or preparing a release. Keeps a living project map (.proofcard/map.json) that traces each feature from what the user does to where the data goes, checked against the real code. Consult it before changing anything, update it after, and prove the change with proofcard verify / ready.
---

# Proofcard: work from the project map

The map is the shared memory of the project: for every feature, what the user does, which screen and
files implement it, what happens behind the screen, where the data goes, what it relies on, which tests
cover it, what is not tested, why it is built this way, and its known problems.
The tool checks the map against the code on every run. You keep it truthful.

Commands: `npx github:Moosartist/proofcard <command>` (below: `pc`).

## Rules that never bend

- **Never invent a link.** Every step has `file` + `find` (a short exact text from that file: a function
  signature, a route string, an element id). If you do not know, write `"file": "unknown"`.
- **Separate what the code proves from what you concluded.** Steps you inferred by reading (not verified by
  running) get `"source": "assistant"`. Bugs you suspect but did not demonstrate say so in the text.
- **Planned is not built.** New work is added with `status: "planned"` first; switch to `built` only when its
  steps are confirmed in code and tests are linked.
- Do not move or rename files just for tidiness. Propose it in `proposals` with the reason and the features
  it helps; do it only when it serves a real change and tests protect the behaviour.

## A. New idea (empty or new project)

1. `pc init --claude` then `pc map add "<feature>" --id <id>` for each thing a user will do.
2. For each feature write `user_action` and a planned `flow` (screen → frontend → api → service → data →
   external) with the files you intend to create. Add `structure` at the top: one line per part saying
   what it is responsible for. Ask the user only what you cannot decide; propose defaults.
3. `pc map check` (must have 0 errors) and `pc map view` → show the user `.proofcard/map.html`.
4. Build feature by feature (section C).

## B. Existing project (possibly messy)

1. `pc init --claude`, then `pc map scan`: files by part, routes, API calls and their handlers, storage,
   outside services, env vars, tests, signs of mess, and entry points.
2. Draft features from the entry points. Use only what the scan and the code show; mark conclusions
   `source: "assistant"`; write `unknown` where a link cannot be found (e.g. a call with no handler).
3. Record known bugs, workarounds ("temporary hack" comments) and debt on the feature they affect.
4. `pc map check`: gaps (unmapped files/routes, missing steps, hidden coupling) are the honest to-do list.
   Add `proposals` for reorganisation with reasons. Show the user `pc map view`.

## C. Every change (feature, fix, refactor)

1. **Before:** `pc map show <feature>` and `pc map impact <file|feature>`: where to start, what else is
   affected, which tests to re-run, open debt. Tell the user in two lines what will change and what
   must not. Respect `structure`; if a file must be added, say which part it belongs to.
2. New feature: add it to the map as `planned` first. Bug fix: reproduce with a failing test first.
3. `pc new "<title>" --type ... --risk ...` for the change card (bug fixes: fill `regression`).
4. Make the change, small and inside scope.
5. **After:** update the map in the same change — new/changed steps, `find` texts, tests, untested items,
   decisions, debt (`status: "fixed"`, `fixed_in`), new debt you knowingly accepted.
6. `pc map check` (0 errors) and `pc verify` (exit 0 = PASS; 1 FAIL; 2 INCOMPLETE). Never weaken a test
   or edit a report. Confirm tests actually ran.
7. Commit, then `pc map mark <feature>` for each feature you reviewed, and commit the map.
   Drift warnings mean a feature's files changed since its entry was last reviewed.

## D. Coming back months later

`pc map view` (or `pc map show <feature>`) for the feature the user names; `pc map impact <file>` for the
file in an error message. Start at the step the map points to; read its open debt and untested items
first; re-run the tests it lists.

## E. Release

Update the brief (`.proofcard/brief.md`: problem, users, success criteria, non-goals, not tested, run &
deploy), commit, `pc ready`. READY requires the map to match the code and every built feature to be
re-confirmed after its last change. High-risk changes need the user's review attestation; never fill it.

## Report to the user

Plain language, no jargon first: what changed for the user, which feature(s) on the map, what was tested
(paste the verify/ready table), what was not, open debt, and what they need to decide. Never write
"secure", "bug-free" or "fully tested".
