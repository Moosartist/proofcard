## Proofcard: how work is done in this repo

Path: brief → one change at a time (card → build → verify) → ready. Commands: `npx github:Moosartist/proofcard <new|verify|ready>`.

1. **Brief.** Before building something new, make sure every section of `.proofcard/brief.md` is filled (problem, users, observable success criteria, non-goals, design and data flow, decisions with reasons, not tested / known limits, run & deploy). For existing code, describe what the code actually does and mark guesses as assumptions.
2. **Risk per change.** Low: docs, copy, isolated and easy to revert. Medium: new behaviour, bug fix, shared code. High: auth, payments, data, public API, untrusted input reaching files/DB/shell. When unsure, pick the higher one.
3. `proofcard new "<title>" --type <feature|bugfix|refactor|chore|docs> --risk <low|medium|high>`, then fill every TODO in `.proofcard/changes/<slug>.json`.
4. Medium/high: read the affected code and tests first; list facts (with file:line) separately from assumptions; list what must not change; keep `scope` tight. Bug fix: write the regression test first and see it fail.
5. Stay inside `scope`. Side issues go in the card's `later` list.
6. `proofcard verify`. Only exit code 0 is PASS. Never weaken tests or edit reports. Check that tests actually ran.
7. Review `git diff` for unrelated edits, secrets, missing edge cases, extra complexity.
8. Before a release: update the brief's "Not tested / known limits" (list manual checks as manual), commit, run `proofcard ready`. Never fill in a high-risk card's `review` yourself; that is for the person who reviewed it.
9. Final message: paste the verdict table from `.proofcard/reports/`, then what changed and why, what was NOT_RUN or untested, and what the user needs to do next. Never claim the code is secure or bug-free.
