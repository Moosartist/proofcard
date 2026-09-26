## Proofcard: work from the project map

`.proofcard/map.json` traces each feature from what the user does to where the data goes (screen → frontend → api → service → data → external), with tests, untested parts, decisions and known debt. `npx github:Moosartist/proofcard map check` verifies it against the code. Keep it truthful.

- **Never invent a link.** Each step has `file` and `find` (exact text in that file). Unknown → `"file": "unknown"`. Conclusions you did not verify → `"source": "assistant"`. New work starts as `status: "planned"`.
- **Before a change:** `proofcard map show <feature>` and `proofcard map impact <file|feature>` — where to start, what else is affected, which tests to re-run, open debt. Respect the `structure` responsibilities; propose reorganisations in `proposals` with reasons instead of moving files.
- **New feature:** add it to the map as planned first. **Bug fix:** reproduce with a failing test first.
- **Change card:** `proofcard new "<title>" --type <feature|bugfix|refactor|chore|docs> --risk <low|medium|high>`, fill every TODO.
- **After the change:** update the map in the same change (steps, find texts, tests, untested, decisions, debt fixed/accepted). Run `proofcard map check` (0 errors) and `proofcard verify` (only exit 0 is PASS). Commit, then `proofcard map mark <feature>` for each reviewed feature and commit the map.
- **Existing messy project:** `proofcard map scan` first; draft features only from what it and the code show.
- **Release:** update `.proofcard/brief.md`, commit, `proofcard ready`. Never fill in a high-risk card's `review` yourself.
- **Report:** plain language — what changed for the user, which features, what was tested (paste the table), what was not, open debt. Never claim the code is secure or bug-free.
