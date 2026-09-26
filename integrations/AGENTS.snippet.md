## Proofcard: how changes are finished in this repo

Every code change gets a change card and ends with a real verification run.

1. Pick the risk: **low** (docs, copy, isolated and easy to revert), **medium** (new behaviour, bug fix, shared code), **high** (auth, payments, data, public API, security-sensitive input). When unsure, pick the higher one.
2. `npx github:Moosartist/proofcard new "<title>" --type <feature|bugfix|refactor|chore|docs> --risk <low|medium|high>` and fill every TODO in `.proofcard/changes/<slug>.json`.
3. Medium/high: read the affected code and tests first; list facts (with file:line) separately from assumptions; list what must not change; keep `scope` tight.
4. Bug fix: write the regression test first and see it fail; put its command and file(s) in `regression`.
5. Stay inside `scope`. Side issues go to a "Later" note, not into this change.
6. Run `npx github:Moosartist/proofcard verify`. Only exit code 0 is PASS. Never weaken tests or edit the report to get PASS. Anything that could not run stays NOT_RUN with a reason.
7. Review `git diff` for unrelated edits, secrets, missing edge cases, extra complexity.
8. Final message: paste the report table from `.proofcard/reports/<slug>.md`, then what changed, what was NOT_RUN and why, and known limits. Never claim the code is secure or bug-free.
