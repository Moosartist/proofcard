# Proofcard

**One path for building a tool or website with an AI assistant, from the idea to "is it ready to publish?", where every verdict comes from what actually ran.**

```
idea or existing repo
  → brief        .proofcard/brief.md: problem, users, success criteria, design, decisions, what's not tested
  → changes      one at a time: card → build → `proofcard verify`   (evidence sized to the risk)
  → release      `proofcard ready`: one report that says what this is, what was tested, what wasn't, and READY or not
```

Your assistant (Claude Code or Codex) follows the path through a skill / `AGENTS.md` section. You read two things: the **brief** (before building) and the **ready report** (before publishing). Proofcard itself is a zero-dependency Node CLI that works on any git repo. It doesn't replace your framework or your planning tools.

## The problem

With an AI assistant it's easy to get something that *looks* done: the UI works and the assistant says "all tests pass". Behind it there may be no shared understanding of what was built or why, unrelated edits, a test that never caught the bug, a server nobody started, or a check that never ran. Planning tools (OpenSpec, Spec Kit, Superpowers, BMad) help with specs and plans. What's usually missing is a light, honest thread from **the intent** to **the evidence**, sized to the risk and not to a ceremony.

## Who it's for

Anyone building a real tool or site with Claude Code or Codex, from an idea or on an existing repository, who wants to understand what was built and to know, not guess, whether it's ready to publish.

## The path in practice

| Step | You (the person) | The assistant | Proofcard checks |
|---|---|---|---|
| **Brief** | answer questions, approve the one-page brief | drafts it from the idea, or from existing code with guesses marked as assumptions | every section filled, no TODO (`ready`) |
| **Each change** | pick or approve the risk; review high-risk changes | card → small build → `verify` | card complete for the risk, scope, secrets in added lines, bug-fix regression red→green, project checks |
| **Ready** | read the report; do what it says is missing | updates "Not tested / known limits", commits, runs `ready` | brief, clean committed state, review attestations for high-risk cards, whole-repo secrets and `.env`, checks, **smoke run of the real app**, production dependency audit, README |

`ready` exits 0 **READY**, 1 **NOT_READY**, or 2 **INCOMPLETE** (something required was NOT_RUN, e.g. no smoke command, or a high-risk change nobody has reviewed yet). NOT_RUN never counts as passing.

**Worked example:** [`examples/tip-split`](examples/tip-split), a small bill-splitting web page built from an idea through the whole path. The record, including what the trial run found and fixed in Proofcard, is in [docs/FULL-PATH.md](docs/FULL-PATH.md). Its published state is honestly **INCOMPLETE**: everything automated passes, and the release waits for a person to review the high-risk server change.

## `verify`: evidence for one change

| Evidence | When | How |
|---|---|---|
| **change card** | always | `.proofcard/changes/<slug>.json`: title, type, risk. Medium adds problem, facts vs assumptions, must-not-change, scope. High adds design, security areas, and a review attestation. `TODO` counts as missing. |
| **scope** | if scope declared (required for medium/high) | every changed file (vs. the merge-base with `base`, plus untracked files) must match the card's globs |
| **secret scan** | always | pattern scan of *added* lines only (private keys, AWS/GitHub/Slack tokens, `sk-…`, hard-coded passwords). Mute one line with `proofcard:allow-secret`. |
| **regression proof** | bug fixes (required for medium/high) | copies your regression test into a clean `git worktree` of the pre-change code and runs it: it **must fail there** and **pass on your code** |
| **project checks** | always | runs each command in `proofcard.json` and records its exit code |
| **review attestation (unverified)** | high risk | NOT_RUN until `review.reviewer` and `review.notes` are filled in. This is a **declaration written in the card**: Proofcard does not check that the person exists, that a GitHub review happened, or that the notes are true. Use GitHub branch protection (required approving reviews) if you need proof of review. |

Verdict: **FAIL** if any required item failed, otherwise **INCOMPLETE** if any required item was NOT_RUN, otherwise **PASS**. Exit codes are 0 / 1 / 2, so CI and agents can't read a NOT_RUN as a pass.

A low-risk change (docs, copy, an isolated one-liner) only gets card + secret scan + checks. No design doc, no forced test.

## Install (existing project, Node ≥ 20, git)

No npm publish yet, so run it straight from GitHub:

```bash
npx github:Moosartist/proofcard init --claude --codex
git add -A && git commit -m "chore: add proofcard"
```

- Creates `.proofcard/brief.md` (template) if missing. Fill it in with your assistant before building.
- Add a `"smoke"` command to `proofcard.json` that starts the real thing and checks it answers. See [the example's](examples/tip-split/scripts/smoke.js).

- `proofcard.json` gets your `typecheck` / `lint` / `test` / `build` npm scripts if they exist. For other stacks, edit `checks` by hand, e.g. `{ "name": "test", "run": "pytest -q" }`. Set `base` to your main branch.
- `--claude` installs the skill at `.claude/skills/proofcard/SKILL.md` (Claude Code picks it up automatically).
- `--codex` adds the same workflow to `AGENTS.md` between `<!-- proofcard -->` markers (re-running replaces it rather than duplicating).
- Commit the setup on its own first. Otherwise the setup files count as out-of-scope changes in your first card.

Optional CI gate: copy [`examples/workflow/proofcard.yml`](examples/workflow/proofcard.yml) to `.github/workflows/`. It uses this repo as a GitHub Action (`Moosartist/proofcard@v0.2.0`), fails the PR unless the verdict is PASS, and writes the report into the job summary. Pair it with branch protection to make it a real gate.

Tested on a real pull request ([proofcard-action-demo#1](https://github.com/Moosartist/proofcard-action-demo/pull/1)), using this Action exactly as a user would:
- regression test without the fix → the step fails with `# Proofcard: FAIL` ([run](https://github.com/Moosartist/proofcard-action-demo/actions/runs/36255797233), attempt 2, commit `7c832a6`)
- fix pushed → `# Proofcard: PASS` ([run](https://github.com/Moosartist/proofcard-action-demo/actions/runs/36255881107), commit `7a08029`)

Only `pull_request` on `ubuntu-latest` with `fetch-depth: 0` has been exercised. Other events and runners haven't been tested yet.

## Bug-fix example

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
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | per-change proposals, specs, design, tasks | richer per-change specs; if you use it, link the OpenSpec change from the brief or card, and Proofcard still produces the evidence |
| [Superpowers](https://github.com/obra/superpowers) | brainstorm → plan → TDD → subagent execution → review skills | its TDD asks the agent to see red then green; Proofcard **re-runs** red/green itself in a clean worktree and in CI |
| [Spec Kit](https://github.com/github/spec-kit) | constitution → spec → plan → tasks; bug-fix extension | no Python/uv or project layout needed; works as a single command on any repo |
| [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) | full agile product lifecycle | a full method with roles and phases; Proofcard is one light path (a one-page brief plus evidence), for when BMad is more than the work needs |
| [Whiteboard](https://github.com/devdotfast/whiteboard) | agent-drawn diagrams linked to code | optional: the skill suggests linking a Whiteboard diagram in a high-risk card's `design`; never required |

What's actually different: the output is a **verdict computed from execution** (exit codes, pre-fix worktree run, git diff) that fails closed (NOT_RUN is never PASS), and the required evidence **scales with declared risk**. Background: [RESEARCH.md](RESEARCH.md).

## Limits (read these)

- **PASS proves only what your checks exercise.** It doesn't mean the code is correct, secure, or reviewed. A project with weak tests gets a weak PASS.
- Risk is **self-declared**. An assistant can under-declare. The report shows the declared risk so a human can challenge it.
- A check that exits 0 without running anything (e.g. a test runner that finds no files) counts as PASS. Proofcard can't see inside your commands. The skill tells the assistant to confirm tests actually ran.
- The brief is checked for **completeness, not correctness**. Proofcard can't tell whether the design is good; that's what reading it is for.
- `ready` doesn't re-run each change's `verify` (reports aren't committed). It re-runs the project checks and smoke on the current commit.
- Manual checks (e.g. clicking through a page) are recorded as text in the brief. They aren't evidence Proofcard can re-run.
- The secret scan is pattern-based: it misses unknown formats and can flag false positives.
- The regression proof runs in a fresh worktree **without your installed dependencies**. For projects that need them, set `regression.setup` (e.g. `"npm ci"`). If setup fails, the item is NOT_RUN.
- Cards are JSON. Scope globs support `*`, `**`, `?` only.
- Proofcard isn't a substitute for an experienced engineer's review, and it does not verify reviews. For high-risk changes it stays INCOMPLETE until a review attestation is filled in; a PASS on that row means only that the card *claims* a review.

## Development

```bash
npm test
```

Runs unit tests, end-to-end `ready` tests on `examples/tip-split` (published state → INCOMPLETE, with attestation → READY, empty repo, uncommitted work, committed `.env`, broken smoke, no smoke), and scenarios that copy `examples/tiny-shop` into temporary git repos and drive the real CLI (feature → PASS, bug fix red→green, weak regression test → FAIL, failing check → FAIL, low-risk path, scope violation, secret, high risk without review attestation → INCOMPLETE, filled attestation labelled unverified, Action never writes into the workspace, `init`). CI runs them on Ubuntu and Windows, Node 20 and 22.

## License

MIT. No code or text from the tools above was copied. See [RESEARCH.md](RESEARCH.md) for their licenses.
