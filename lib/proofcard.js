'use strict';
// Proofcard core: change cards, evidence collection, honest verdicts.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = '.proofcard';
const CARDS = path.join(DIR, 'changes');
const REPORTS = path.join(DIR, 'reports');
const CONFIG = 'proofcard.json';
const TYPES = ['feature', 'bugfix', 'refactor', 'chore', 'docs'];
const RISKS = ['low', 'medium', 'high'];
const OUTPUT_TAIL = 1500;

// Card fields required per risk. Low risk stays deliberately light.
const REQUIRED_FIELDS = {
  low: ['title', 'type', 'risk'],
  medium: ['title', 'type', 'risk', 'problem', 'must_not_change', 'scope'],
  high: ['title', 'type', 'risk', 'problem', 'must_not_change', 'scope', 'design', 'security'],
};

// ---------- small helpers ----------
function sh(cmd, cwd, env) {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  return { code: r.status === null ? 1 : r.status, output, error: r.error ? String(r.error.message) : null };
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

function tail(s) {
  const t = s.trim();
  return t.length > OUTPUT_TAIL ? '…' + t.slice(-OUTPUT_TAIL) : t;
}

function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '' || /^TODO\b/i.test(v.trim());
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(file, globs) {
  return globs.some((g) => globToRegExp(g).test(file));
}

// ---------- config & cards ----------
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot read ${file}: ${e.message}`);
  }
}

function loadConfig(root) {
  const file = path.join(root, CONFIG);
  if (!fs.existsSync(file)) return { base: 'HEAD', checks: [], _missing: true };
  const cfg = readJson(file);
  return { base: cfg.base || 'HEAD', checks: cfg.checks || [], secretAllow: cfg.secretAllow || [] };
}

function detectChecks(root) {
  const pkgFile = path.join(root, 'package.json');
  if (!fs.existsSync(pkgFile)) return [];
  const scripts = readJson(pkgFile).scripts || {};
  // Plain `npm` works through the shell on every OS, so the committed config stays portable.
  const checks = [];
  for (const name of ['typecheck', 'lint', 'test', 'build']) {
    if (!scripts[name]) continue;
    if (name === 'test' && /no test specified/.test(scripts[name])) continue;
    checks.push({ name, run: name === 'test' ? 'npm test' : `npm run ${name}` });
  }
  return checks;
}

function cardTemplate({ title, type, risk }) {
  const card = { title, type, risk };
  if (risk !== 'low') {
    card.problem = 'TODO: what is wrong or missing, in one or two sentences. For a bug: how you reproduced it and the likely cause.';
    card.facts = ['TODO: things you saw in the code or output (file:line)'];
    card.assumptions = ['TODO: things you believe but have not verified'];
    card.must_not_change = ['TODO: behaviour, APIs or files that must stay as they are'];
    card.scope = ['TODO: glob of files this change may touch, e.g. src/cart/**'];
    card.later = [];
  }
  if (risk === 'high') {
    card.design = 'TODO: data flow and dependencies touched; link a diagram (e.g. Whiteboard) if you drew one';
    card.security = 'TODO: which security areas were considered (e.g. OWASP ASVS: input validation, authz, secrets) and how';
    card.review = { reviewer: '', notes: '' };
  }
  if (type === 'bugfix') {
    card.regression = {
      command: 'TODO: command that runs only the regression test',
      files: ['TODO: test file(s) that reproduce the bug'],
    };
  }
  return card;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'change';
}

function newCard(root, { title, type = 'feature', risk = 'medium', slug }) {
  if (!title) throw new Error('A title is required: proofcard new "Fix discount rounding" --type bugfix --risk medium');
  if (!TYPES.includes(type)) throw new Error(`--type must be one of ${TYPES.join(', ')}`);
  if (!RISKS.includes(risk)) throw new Error(`--risk must be one of ${RISKS.join(', ')}`);
  const name = slug || slugify(title);
  const file = path.join(root, CARDS, `${name}.json`);
  if (fs.existsSync(file)) throw new Error(`Card already exists: ${path.relative(root, file)}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cardTemplate({ title, type, risk }), null, 2) + '\n');
  return path.relative(root, file);
}

// ---------- git evidence ----------
function mergeBase(root, base) {
  try {
    return git(['merge-base', base, 'HEAD'], root).trim();
  } catch {
    return git(['rev-parse', base], root).trim();
  }
}

function changedFiles(root, baseRev) {
  const tracked = git(['diff', '--name-only', baseRev], root).split('\n');
  const untracked = git(['ls-files', '--others', '--exclude-standard'], root).split('\n');
  return [...new Set([...tracked, ...untracked].map((f) => f.trim()).filter(Boolean))]
    .filter((f) => !f.startsWith(`${DIR}/reports/`));
}

function addedLines(root, baseRev) {
  const out = [];
  const diff = git(['diff', '--unified=0', '--no-color', '--no-ext-diff', baseRev], root);
  let file = null;
  let line = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) file = l.startsWith('+++ b/') ? l.slice(6) : null;
    else if (l.startsWith('@@')) line = Number((/\+(\d+)/.exec(l) || [0, 0])[1]);
    else if (file && l.startsWith('+')) out.push({ file, line: line++, text: l.slice(1) });
  }
  for (const f of git(['ls-files', '--others', '--exclude-standard'], root).split('\n').filter(Boolean)) {
    const buf = fs.readFileSync(path.join(root, f));
    if (buf.includes(0)) continue;
    buf.toString('utf8').split('\n').forEach((text, i) => out.push({ file: f, line: i + 1, text }));
  }
  return out.filter((a) => !a.file.startsWith(`${DIR}/reports/`));
}

const SECRET_PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ['API key (sk-…)', /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['hard-coded credential', /(?:api[_-]?key|secret|password|passwd|token)["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];

function scanSecrets(lines, allow = []) {
  const hits = [];
  for (const a of lines) {
    if (allow.length && matchesAny(a.file, allow)) continue;
    if (/proofcard:allow-secret/.test(a.text)) continue;
    for (const [kind, re] of SECRET_PATTERNS) {
      if (re.test(a.text)) { hits.push(`${a.file}:${a.line} looks like a ${kind}`); break; }
    }
  }
  return hits;
}

// ---------- regression proof ----------
function regressionProof(root, baseRev, reg) {
  const files = reg.files || [];
  for (const f of files) {
    if (!fs.existsSync(path.join(root, f))) return { status: 'FAIL', detail: `regression file not found: ${f}` };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcard-'));
  const wt = path.join(tmp, 'before');
  try {
    git(['worktree', 'add', '--detach', '--quiet', wt, baseRev], root);
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(wt, f)), { recursive: true });
      fs.copyFileSync(path.join(root, f), path.join(wt, f));
    }
    if (reg.setup) {
      const s = sh(reg.setup, wt);
      if (s.code !== 0) return { status: 'NOT_RUN', detail: `setup failed in pre-fix worktree (exit ${s.code})`, output: tail(s.output) };
    }
    const before = sh(reg.command, wt);
    const after = sh(reg.command, root);
    const out = `--- before fix (${baseRev.slice(0, 7)}), exit ${before.code}\n${tail(before.output)}\n--- after fix (working tree), exit ${after.code}\n${tail(after.output)}`;
    if (before.code === 0) return { status: 'FAIL', detail: 'regression test PASSES on the code before the fix, so it does not detect the bug', output: out };
    if (after.code !== 0) return { status: 'FAIL', detail: `regression test fails on the current code (exit ${after.code}): the bug is not fixed yet`, output: out };
    return { status: 'PASS', detail: `fails before the fix (exit ${before.code}), passes after (exit 0)`, output: out };
  } catch (e) {
    return { status: 'NOT_RUN', detail: `could not build pre-fix worktree: ${e.message}` };
  } finally {
    try { git(['worktree', 'remove', '--force', wt], root); } catch { /* already gone */ }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- verify ----------
function findCards(root, changed) {
  return changed.filter((f) => f.startsWith(`${DIR}/changes/`) && f.endsWith('.json'));
}

function verify(root, { card: cardArg, base: baseArg } = {}) {
  const cfg = loadConfig(root);
  const base = baseArg || cfg.base;
  const baseRev = mergeBase(root, base);
  const changed = changedFiles(root, baseRev);
  const items = [];
  const add = (name, status, detail, extra = {}) => items.push({ name, status, detail, required: true, ...extra });

  // 1. Which card?
  let cardPath = cardArg;
  if (cardPath && !cardPath.endsWith('.json')) cardPath = path.join(CARDS, `${cardPath}.json`);
  if (!cardPath) {
    const found = findCards(root, changed);
    if (found.length !== 1) {
      add('change card', 'NOT_RUN', found.length ? `${found.length} changed cards; pass one with --card` : 'no change card in this diff; run `proofcard new`');
      return finish(root, { title: '(no card)', risk: '?', type: '?' }, null, base, changed, items);
    }
    cardPath = found[0];
  }
  const card = readJson(path.join(root, cardPath));
  const risk = RISKS.includes(card.risk) ? card.risk : 'high'; // unknown risk is treated as high
  const missing = REQUIRED_FIELDS[risk].filter((f) => isEmpty(card[f]));
  if (!TYPES.includes(card.type)) missing.push('type (valid value)');
  add('change card', missing.length ? 'FAIL' : 'PASS', missing.length ? `missing or TODO for ${risk} risk: ${missing.join(', ')}` : `complete for ${risk} risk`);

  // 2. Scope: changed files must be inside the declared scope.
  const code = changed.filter((f) => !f.startsWith(`${DIR}/`));
  if (Array.isArray(card.scope) && !isEmpty(card.scope)) {
    const outside = code.filter((f) => !matchesAny(f, card.scope));
    add('scope', outside.length ? 'FAIL' : 'PASS', outside.length ? `changed outside declared scope: ${outside.join(', ')}` : `${code.length} changed file(s), all inside scope`);
  } else if (risk !== 'low') {
    add('scope', 'NOT_RUN', 'no scope declared');
  }

  // 3. Secrets in added lines.
  const hits = scanSecrets(addedLines(root, baseRev), cfg.secretAllow);
  add('secret scan (added lines)', hits.length ? 'FAIL' : 'PASS', hits.length ? hits.join('; ') : 'no known secret patterns in added lines (pattern scan, not a guarantee)');

  // 4. Regression proof for bug fixes.
  if (card.type === 'bugfix') {
    const needed = risk !== 'low';
    if (!card.regression || isEmpty(card.regression.command) || isEmpty(card.regression.files)) {
      add('regression proof', 'NOT_RUN', 'card has no regression.command / regression.files', { required: needed });
    } else {
      const r = regressionProof(root, baseRev, card.regression);
      add('regression proof', r.status, r.detail, { required: needed, output: r.output });
    }
  }

  // 5. Project checks, actually executed.
  if (!cfg.checks.length) {
    add('project checks', 'NOT_RUN', cfg._missing ? `no ${CONFIG}; run \`proofcard init\`` : `no checks configured in ${CONFIG}`);
  }
  for (const c of cfg.checks) {
    const r = sh(c.run, root);
    add(`check: ${c.name}`, r.code === 0 ? 'PASS' : 'FAIL', `\`${c.run}\` exited ${r.code}${r.error ? ` (${r.error})` : ''}`, { output: tail(r.output) });
  }

  // 6. High risk needs a named human reviewer. Checks are not a review.
  if (risk === 'high') {
    const rv = card.review || {};
    add('human review', isEmpty(rv.reviewer) || isEmpty(rv.notes) ? 'NOT_RUN' : 'PASS', isEmpty(rv.reviewer) || isEmpty(rv.notes) ? 'high risk: review.reviewer and review.notes are empty' : `reviewed by ${rv.reviewer}`);
  }

  return finish(root, card, cardPath, base, changed, items);
}

function finish(root, card, cardPath, base, changed, items) {
  const req = items.filter((i) => i.required);
  const verdict = req.some((i) => i.status === 'FAIL') ? 'FAIL' : req.some((i) => i.status === 'NOT_RUN') ? 'INCOMPLETE' : 'PASS';
  const result = { verdict, card: { title: card.title, type: card.type, risk: card.risk, path: cardPath }, base, changed, items };
  result.markdown = renderReport(result);
  const name = cardPath ? path.basename(cardPath, '.json') : 'no-card';
  fs.mkdirSync(path.join(root, REPORTS), { recursive: true });
  fs.writeFileSync(path.join(root, REPORTS, `${name}.md`), result.markdown);
  fs.writeFileSync(path.join(root, REPORTS, `${name}.json`), JSON.stringify({ ...result, markdown: undefined }, null, 2) + '\n');
  result.reportPath = path.join(REPORTS, `${name}.md`);
  return result;
}

function renderReport(r) {
  const lines = [
    `# Proofcard: ${r.verdict}`,
    '',
    `**${r.card.title}** — ${r.card.type}, ${r.card.risk} risk · base \`${r.base}\` · ${r.changed.length} changed file(s)`,
    '',
    '| Evidence | Status | Detail |',
    '|---|---|---|',
    ...r.items.map((i) => `| ${i.name}${i.required ? '' : ' (optional)'} | ${i.status} | ${String(i.detail).replace(/\|/g, '\\|')} |`),
    '',
  ];
  for (const i of r.items.filter((x) => x.output && x.status !== 'PASS')) {
    lines.push(`<details><summary>${i.name} output</summary>`, '', '```', i.output, '```', '</details>', '');
  }
  lines.push(
    'PASS means every required item above was executed and succeeded. It does not mean the code is secure or bug-free;',
    'it covers only what these checks exercise. NOT_RUN items were not executed and are not counted as passing.',
    ''
  );
  return lines.join('\n');
}

module.exports = { verify, newCard, loadConfig, detectChecks, globToRegExp, scanSecrets, CONFIG, DIR, CARDS };
