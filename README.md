# Proofcard

**An evidence gate for AI-assisted code changes.** Your coding assistant writes a small change card, makes the change, and runs `proofcard verify`. The verdict comes from what actually ran (exit codes, a before/after regression run, the real diff), not from the assistant's summary of its own work.

```text
# Proofcard: PASS
| Evidence                  | Status | Detail                                              |
|---------------------------|--------|-----------------------------------------------------|
| change card               | PASS   | complete for medium risk                            |
| scope                     | PASS   | 2 changed file(s), all inside scope                 |
| secret scan (added lines) | PASS   | no known secret patterns in added lines             |
| regression proof          | PASS   | fails before the fix (exit 1), passes after (exit 0) |
| check: test               | PASS   | `npm test` exited 0                                 |
```

## The problem

With Claude Code or Codex it's easy to get something that *looks* done: the UI works, the assistant says "all tests pass", and behind it are unrelated edits, a test that never caught the bug, or a check that never ran. Planning tools (OpenSpec, Spec Kit, Superpowers, BMad) already help with specs, plans and TDD. What's usually missing is the last mile: **mechanical proof before you accept the change**, sized to how risky the change is.

## Who it's for

People who build real products with AI coding assistants on an **existing** repository and want every change to end with evidence they can check. Nothing in your project has to move to a new framework.

## What it does

| Evidence | When | How |
|---|---|---|
| **change card** | always | `.proofcard/changes/<slug>.json`: title, type, risk. Medium adds problem, facts vs assumptions, must-not-change, scope. High adds design, security areas, a named reviewer. `TODO` counts as missing. |
| **scope** | if scope declared (required for medium/high) | every changed file (vs. the merge-base with `base`, plus untracked files) must match the card's globs |
| **secret scan** | always | pattern scan of *added* lines only (private keys, AWS/GitHub/Slack tokens, `sk-…`, hard-coded passwords). Mute one line with `proofcard:allow-secret`. |
| **regression proof** | bug fixes (required for medium/high) | copies your regression test into a clean `git worktree` of the pre-change code and runs it: it **must fail there** and **pass on your code** |
| **project checks** | always | runs each command in `proofcard.json` and records its exit code |
| **human review** | high risk | NOT_RUN until `review.reviewer` and `review.notes` are filled in. Checks are not a review. |

Verdict: **FAIL** if any required item failed, otherwise **INCOMPLETE** if any required item was NOT_RUN, otherwise **PASS**. Exit codes are 0 / 1 / 2, so CI and agents can't read a NOT_RUN as a pass.

A low-risk change (docs, copy, an isolated one-liner) only gets card + secret scan + checks. No design doc, no forced test.

## Install (existing project, Node ≥ 20, git)

No npm publish yet, so run it straight from GitHub:

```bash
npx github:Moosartist/proofcard init --claude --codex
git add -A && git commit -m "chore: add proofcard"
```

- `proofcard.json` gets your `typecheck` / `lint` / `test` / `build` npm scripts if they exist. For other stacks, edit `checks` by hand, e.g. `{ "name": "test", "run": "pytest -q" }`. Set `base` to your main branch.
- `--claude` installs the skill at `.claude/skills/proofcard/SKILL.md` (Claude Code picks it up automatically).
- `--codex` adds the same workflow to `AGENTS.md` between `<!-- proofcard -->` markers (re-running replaces it rather than duplicating).
- Commit the setup on its own first. Otherwise the setup files count as out-of-scope changes in your first card.

Optional CI gate: copy [`examples/workflow/proofcard.yml`](examples/workflow/proofcard.yml) to `.github/workflows/`. It uses this repo as a GitHub Action (`Moosartist/proofcard@v0.1.0`), fails the PR unless the verdict is PASS, and writes the report into the job summary. Pair it with branch protection to make it a real gate.

> **Status in v0.1.0:** the CLI and its scenarios are tested in CI; the composite Action itself has **not yet been exercised on a real pull request**. Treat it as experimental.

## Full example (bug fix)

The repo ships [`examples/tiny-shop`](examples/tiny-shop), a cart module with a known bug: `cartTotal` ignores `qty`.

```bash
npx github:Moosartist/proofcard new "cartTotal ignores qty" --type bugfix --risk medium
```

Fill in the card (problem + how it was reproduced, facts with `file:line`, assumptions, must-not-change, `scope: ["src/cart.js", "test/**"]`, `regression: { command: "node --test test/qty.test.js", files: ["test/qty.test.js"] }`), write the failing test, then:

```bash
npx github:Moosartist/proofcard verify
```

1. **Before the fix:** `FAIL`, and the regression item says *"fails on the current code: the bug is not fixed yet"*.
2. **After the fix:** `PASS`, and the regression item says *"fails before the fix (exit 1), passes after (exit 0)"*.
3. **If the test would have passed on the buggy code anyway:** `FAIL`, *"regression test PASSES on the code before the fix, so it does not detect the bug"*.

Full captured output, including the low-risk path: [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

## How it relates to similar tools

Proofcard doesn't replace any of these. It's meant to sit after them.

| Tool | Its strength | Proofcard's relation |
|---|---|---|
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | per-change proposals, specs, design, tasks | use it for the spec; Proofcard checks the change actually holds up |
| [Superpowers](https://github.com/obra/superpowers) | brainstorm → plan → TDD → subagent execution → review skills | its TDD asks the agent to see red then green; Proofcard **re-runs** red/green itself in a clean worktree and in CI |
| [Spec Kit](https://github.com/github/spec-kit) | constitution → spec → plan → tasks; bug-fix extension | no Python/uv or project layout needed; works as a single command on any repo |
| [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) | full agile product lifecycle | different scope; Proofcard is one gate, not a method |
| [Whiteboard](https://github.com/devdotfast/whiteboard) | agent-drawn diagrams linked to code | optional: the skill suggests linking a Whiteboard diagram in a high-risk card's `design`; never required |

What's actually different: the output is a **verdict computed from execution** (exit codes, pre-fix worktree run, git diff) that fails closed (NOT_RUN is never PASS), and the required evidence **scales with declared risk**. Background: [RESEARCH.md](RESEARCH.md).

## Limits (read these)

- **PASS proves only what your checks exercise.** It doesn't mean the code is correct, secure, or reviewed. A project with weak tests gets a weak PASS.
- Risk is **self-declared**. An assistant can under-declare. The report shows the declared risk so a human can challenge it.
- A check that exits 0 without running anything (e.g. a test runner that finds no files) counts as PASS. Proofcard can't see inside your commands.
- The secret scan is pattern-based: it misses unknown formats and can flag false positives.
- The regression proof runs in a fresh worktree **without your installed dependencies**. For projects that need them, set `regression.setup` (e.g. `"npm ci"`). If setup fails, the item is NOT_RUN.
- The GitHub Action is untested on real PRs in v0.1.0 (see Install).
- Cards are JSON. Scope globs support `*`, `**`, `?` only.
- Proofcard isn't a substitute for an experienced engineer's review. For high-risk changes it deliberately stays INCOMPLETE until a person signs the review.

## Development

```bash
npm test
```

Runs unit tests plus end-to-end scenarios that copy `examples/tiny-shop` into temporary git repos and drive the real CLI (feature → PASS, bug fix red→green, weak regression test → FAIL, failing check → FAIL, low-risk path, scope violation, secret, high risk without reviewer → INCOMPLETE, `init`). CI runs them on Ubuntu and Windows, Node 20 and 22.

## License

MIT. No code or text from the tools above was copied. See [RESEARCH.md](RESEARCH.md) for their licenses.
