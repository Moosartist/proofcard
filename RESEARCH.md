# Research (bounded, 2026-09-26)

Sources were read from the official repositories on GitHub (README, LICENSE, repo metadata) on 2026-09-26. Star counts and features change fast; re-check before citing.

| Source | What it offers | What it lacks for our goal | License | Decision |
|---|---|---|---|---|
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) | Per-change proposal / specs / design / tasks, brownfield-friendly, `/opsx:*` commands for many agents | Artifacts are text; nothing *executes* the project's checks or refuses to call a change done | MIT | **Integrate**: a Proofcard card can link to an OpenSpec change; we don't re-implement specs |
| [Superpowers](https://github.com/obra/superpowers) | Skills for brainstorming → plan → red/green TDD → subagent execution → review; Claude Code + Codex | Verification is enforced by instructions to the agent; the agent's own summary is still the evidence | MIT | **Integrate**: use its TDD/review skills; Proofcard is the executable gate after them |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | Constitution → spec → plan → tasks → implement; bug-fix extension (diagnose / scoped fix / recorded verification) | Needs Python 3.11 + uv and its own project layout; "recorded verification" is recorded by the agent, not re-run in CI | MIT | **Integrate / exclude overlap**: don't rebuild its spec pipeline |
| [BMad Method](https://github.com/bmad-code-org/BMAD-METHOD) | Full agile product lifecycle (clarify, plan, architecture, build), sizes process to the work | Broad product method; far larger than a verification step | MIT (GitHub shows NOASSERTION; LICENSE file is MIT) | **Exclude** for v0.1 (different scope) |
| [Whiteboard (devdotfast)](https://github.com/devdotfast/whiteboard) | Desktop canvas where agents draw sequence/ER diagrams linked to code; branch reviews | A visual understanding tool, not a pass/fail gate; macOS/Fedora app | MIT | **Optional integration**: skill suggests drawing the data flow there for medium/high risk; never required |
| [Google eng-practices](https://google.github.io/eng-practices/) (small CLs, what to look for in review) | Small, self-contained changes; reviewer checks design, tests, complexity, scope | Human guidance only | CC-BY 3.0 | **Use as principles** (paraphrased, not copied): scope check, "must not change" list |
| [GitHub Actions](https://docs.github.com/actions) | Runs commands on every PR; failing job blocks merge with branch protection | — | — | **Use**: ship a composite action that runs the gate |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Verification requirements for web app security by level | Not a tool; too large to force on every change | CC-BY-SA 4.0 | **Use proportionally**: high-risk cards must name the security areas considered; we never claim a project is secure |

No code or text was copied from any of these projects.

## Does one tool already do the whole job?

**No.** Planning, specs and TDD guidance are well covered (OpenSpec, Spec Kit, Superpowers, BMad). What none of them does is the last step as a *mechanical* gate that works on any existing repo:

- re-run the project's real checks and report **PASS / FAIL / NOT_RUN** from exit codes, never from the agent's description;
- prove a bug-fix regression test **fails on the code before the fix and passes after** (in a clean git worktree);
- refuse a change that touched files outside its declared scope, or added something that looks like a secret;
- scale the required evidence to the declared risk, so a typo fix isn't forced through a design ritual.

## Smallest original useful product

**Proofcard**: a zero-dependency Node CLI + a Claude Code skill + a Codex `AGENTS.md` snippet + a GitHub Action.
One small JSON "change card" per change (problem, what must not change, scope, risk) and one command, `proofcard verify`, that produces an honest report and a non-zero exit code when evidence is missing. Everything else (specs, plans, diagrams) stays with the tools above.
