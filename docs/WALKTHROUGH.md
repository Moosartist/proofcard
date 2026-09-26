# Walkthrough: tiny-shop, captured output

Real terminal output from running Proofcard v0.1.0 on a copy of `examples/tiny-shop` (Windows, Node 24, 2026-09-26).
Report tables are trimmed to the verdict and table lines; git line-ending warnings are removed. The same flows run automatically in `test/scenarios.test.js` on every CI build.

The card used for the bug fix:

```json
{
  "title": "cartTotal ignores qty",
  "type": "bugfix",
  "risk": "medium",
  "problem": "cartTotal([{priceCents:250,qty:4}]) returns 250, expected 1000. Likely cause: the reduce in src/cart.js adds priceCents without multiplying by qty.",
  "facts": ["src/cart.js:6 reduce sums item.priceCents only"],
  "assumptions": ["items without qty should count as 1 (existing tests pass qty:1)"],
  "must_not_change": ["cartTotal(items, discountPercent) signature", "discount rounding"],
  "scope": ["src/cart.js", "test/**"],
  "later": [],
  "regression": { "command": "node --test test/qty.test.js", "files": ["test/qty.test.js"] }
}
```

```text
$ proofcard init --claude --codex && git add -A && git commit -m "chore: add proofcard"
✓ wrote proofcard.json with 1 check(s): test
✓ added .proofcard/reports/ to .gitignore
✓ installed Claude Code skill at .claude/skills/proofcard/SKILL.md
✓ added the Proofcard section to AGENTS.md (between proofcard markers)

$ proofcard new "cartTotal ignores qty" --type bugfix --risk medium
Created .proofcard\changes\carttotal-ignores-qty.json. Fill in every TODO before `proofcard verify`.

# (card filled in; regression test test/qty.test.js written; fix NOT applied yet)
$ proofcard verify
# Proofcard: FAIL
**cartTotal ignores qty** — bugfix, medium risk · base `main` · 2 changed file(s)
| Evidence | Status | Detail |
|---|---|---|
| change card | PASS | complete for medium risk |
| scope | PASS | 1 changed file(s), all inside scope |
| secret scan (added lines) | PASS | no known secret patterns in added lines (pattern scan, not a guarantee) |
| regression proof | FAIL | regression test fails on the current code (exit 1): the bug is not fixed yet |
| check: test | FAIL | `npm test` exited 1 |
exit 1

# (fix applied in src/cart.js)
$ proofcard verify
# Proofcard: PASS
**cartTotal ignores qty** — bugfix, medium risk · base `main` · 3 changed file(s)
| Evidence | Status | Detail |
|---|---|---|
| change card | PASS | complete for medium risk |
| scope | PASS | 2 changed file(s), all inside scope |
| secret scan (added lines) | PASS | no known secret patterns in added lines (pattern scan, not a guarantee) |
| regression proof | PASS | fails before the fix (exit 1), passes after (exit 0) |
| check: test | PASS | `npm test` exited 0 |
PASS means every required item above was executed and succeeded. It does not mean the code is secure or bug-free;
it covers only what these checks exercise. NOT_RUN items were not executed and are not counted as passing.
exit 0

# Low-risk change on another branch: one README word
$ proofcard new "Fix README wording" --type docs --risk low
Created .proofcard\changes\fix-readme-wording.json. Fill in every TODO before `proofcard verify`.
$ proofcard verify
# Proofcard: PASS
**Fix README wording** — docs, low risk · base `main` · 2 changed file(s)
| Evidence | Status | Detail |
|---|---|---|
| change card | PASS | complete for low risk |
| secret scan (added lines) | PASS | no known secret patterns in added lines (pattern scan, not a guarantee) |
| check: test | PASS | `npm test` exited 0 |
exit 0
```
