'use strict';
// Release readiness: one report a person can read to know what was built, why,
// what was actually tested, what was not, and whether it is ready to publish.
const fs = require('fs');
const path = require('path');
const { sh, git, tail, loadConfig, scanSecrets, DIR, CARDS } = require('./proofcard');

const BRIEF = path.join(DIR, 'brief.md');
const REPORTS = path.join(DIR, 'reports');

// Sections a brief must fill in. Matched by heading prefix, case-insensitive.
const BRIEF_SECTIONS = [
  'Problem',
  'Users',
  'Success criteria',
  'Non-goals',
  'Design',
  'Decisions',
  'Not tested / known limits',
  'Run & deploy',
];

const BRIEF_TEMPLATE = `# Project brief

<!-- One page. Fill it before building; update it when the design changes.
     Every section needs real content: an empty section or one containing TODO fails \`proofcard ready\`.
     Keep it short: a reader should understand the project in two minutes. -->

## Problem
TODO: what problem this solves, in two or three sentences.

## Users
TODO: who uses it and in what situation.

## Success criteria
TODO: observable outcomes that mean it works, e.g. "a user can split a bill of 3 people in under 10 seconds".

## Non-goals
TODO: what this deliberately does not do (at least for now).

## Design
TODO: the main parts and how data flows between them (input → processing → output),
external services and dependencies. A short list or ASCII diagram is enough.

## Decisions
TODO: the choices that shaped the design, each with its reason, e.g.
- No database: state fits in the URL, nothing to secure or back up.

## Not tested / known limits
TODO: what has not been tested, where it is known to break, what is left for later.

## Run & deploy
TODO: exact commands to install, run, test, and where/how it is deployed.
`;

function parseBrief(text) {
  const clean = text.replace(/<!--[\s\S]*?-->/g, '');
  const sections = {};
  let current = null;
  for (const line of clean.split('\n')) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { current = h[1]; sections[current] = []; continue; }
    if (current) sections[current].push(line);
  }
  const out = {};
  for (const name of BRIEF_SECTIONS) {
    const key = Object.keys(sections).find((k) => k.toLowerCase().startsWith(name.toLowerCase().split(' /')[0]));
    out[name] = key ? sections[key].join('\n').trim() : null;
  }
  return out;
}

function createBrief(root) {
  const file = path.join(root, BRIEF);
  if (fs.existsSync(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, BRIEF_TEMPLATE);
  return true;
}

function readCards(root) {
  const dir = path.join(root, CARDS);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    try {
      return { slug: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) };
    } catch {
      return { slug: f.replace(/\.json$/, ''), title: '(unreadable card)', _bad: true };
    }
  });
}

function trackedFiles(root) {
  return git(['ls-files'], root).split('\n').filter(Boolean);
}

function ready(root) {
  const cfg = loadConfig(root);
  const items = [];
  const add = (name, status, detail, extra = {}) => items.push({ name, status, detail, required: true, ...extra });

  // 1. The brief: can a reader understand what this is and why?
  const briefFile = path.join(root, BRIEF);
  let brief = null;
  if (!fs.existsSync(briefFile)) {
    add('project brief', 'FAIL', `no .proofcard/brief.md; run \`proofcard init\``);
  } else {
    brief = parseBrief(fs.readFileSync(briefFile, 'utf8'));
    const missing = BRIEF_SECTIONS.filter((s) => !brief[s] || /\bTODO\b/.test(brief[s]));
    add('project brief', missing.length ? 'FAIL' : 'PASS', missing.length ? `empty or TODO: ${missing.join(', ')}` : 'all sections filled');
  }

  // 2. Readiness is judged on committed code only.
  const dirty = git(['status', '--porcelain', '--untracked-files=all'], root).split('\n')
    .filter(Boolean).map((l) => l.slice(3)).filter((f) => !f.startsWith(`${DIR}/reports/`));
  let head = null;
  try { head = git(['rev-parse', '--short', 'HEAD'], root).trim(); } catch { /* no commits yet */ }
  if (!head) add('committed state', 'FAIL', 'no commits yet');
  else add('committed state', dirty.length ? 'FAIL' : 'PASS', dirty.length ? `uncommitted: ${dirty.slice(0, 8).join(', ')}${dirty.length > 8 ? ', …' : ''}` : 'working tree clean');

  // 3. Every change has a card that is readable.
  const cards = readCards(root);
  const bad = cards.filter((c) => c._bad);
  add('change cards', bad.length ? 'FAIL' : 'PASS', bad.length ? `unreadable: ${bad.map((c) => c.slug).join(', ')}` : `${cards.length} card(s)`, { required: bad.length > 0 });
  // A high-risk change without a review attestation keeps the whole release INCOMPLETE.
  const unreviewed = cards.filter((c) => c.risk === 'high' && (!c.review || !String(c.review.reviewer || '').trim() || !String(c.review.notes || '').trim()));
  if (cards.some((c) => c.risk === 'high')) {
    add('review attestations (unverified)', unreviewed.length ? 'NOT_RUN' : 'PASS', unreviewed.length
      ? `high-risk change(s) with no review attestation: ${unreviewed.map((c) => c.title).join(', ')}`
      : 'every high-risk card names a reviewer; these are declarations, not verified by Proofcard');
  }

  // 4. Secrets anywhere in the tracked tree, not just in the last diff.
  const files = trackedFiles(root);
  const envFiles = files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.(example|sample|template)$/.test(f));
  const lines = [];
  for (const f of files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p) || fs.statSync(p).size > 1024 * 1024) continue;
    const buf = fs.readFileSync(p);
    if (buf.includes(0)) continue;
    buf.toString('utf8').split('\n').forEach((text, i) => lines.push({ file: f, line: i + 1, text }));
  }
  const hits = [...envFiles.map((f) => `${f} is a committed env file`), ...scanSecrets(lines, cfg.secretAllow)];
  add('secret scan (whole repo)', hits.length ? 'FAIL' : 'PASS', hits.length ? hits.join('; ') : `${files.length} tracked file(s), no known secret patterns (pattern scan, not a guarantee)`);

  // 5. The project's own checks.
  if (!cfg.checks.length) add('project checks', 'NOT_RUN', cfg._missing ? 'no proofcard.json; run `proofcard init`' : 'no checks configured');
  for (const c of cfg.checks) {
    const r = sh(c.run, root);
    add(`check: ${c.name}`, r.code === 0 ? 'PASS' : 'FAIL', `\`${c.run}\` exited ${r.code}`, { output: tail(r.output) });
  }

  // 6. Smoke: the thing actually starts and answers, the way it will be deployed.
  if (!cfg.smoke) {
    add('smoke check', 'NOT_RUN', 'no "smoke" command in proofcard.json (e.g. build, start, request the main page)');
  } else {
    const r = sh(cfg.smoke, root);
    add('smoke check', r.code === 0 ? 'PASS' : 'FAIL', `\`${cfg.smoke}\` exited ${r.code}`, { output: tail(r.output) });
  }

  // 7. Known-vulnerable production dependencies (npm projects).
  const pkgFile = path.join(root, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const deps = Object.keys(JSON.parse(fs.readFileSync(pkgFile, 'utf8')).dependencies || {});
    if (!deps.length) add('dependency audit', 'PASS', 'no production dependencies');
    else if (!fs.existsSync(path.join(root, 'package-lock.json'))) add('dependency audit', 'FAIL', `${deps.length} production dependencies but no package-lock.json`);
    else {
      const r = sh('npm audit --omit=dev --audit-level=high --json', root);
      let json = null;
      try { json = JSON.parse(r.output.slice(r.output.indexOf('{'))); } catch { /* not JSON */ }
      if (!json || json.error) add('dependency audit', 'NOT_RUN', `npm audit could not run${json && json.error ? `: ${json.error.summary || json.error.code}` : ''}`);
      else {
        const v = (json.metadata && json.metadata.vulnerabilities) || {};
        const serious = (v.high || 0) + (v.critical || 0);
        add('dependency audit', serious ? 'FAIL' : 'PASS', `npm audit (production): ${v.critical || 0} critical, ${v.high || 0} high, ${v.moderate || 0} moderate`);
      }
    }
  } else {
    add('dependency audit', 'NOT_RUN', 'not an npm project; add your ecosystem\'s audit to "checks"', { required: false });
  }

  // 8. Someone new can find out how to run it.
  const readme = files.find((f) => /^readme(\.md)?$/i.test(f));
  const readmeText = readme ? fs.readFileSync(path.join(root, readme), 'utf8') : '';
  const hasRun = /^#+\s*.*(install|setup|getting started|usage|run|quick ?start)/im.test(readmeText);
  add('README', readme && hasRun ? 'PASS' : 'FAIL', !readme ? 'no README' : hasRun ? `${readme} has run/install instructions` : `${readme} has no install/usage/run heading`);

  const license = files.find((f) => /^(license|licence|copying)(\.|$)/i.test(f));
  add('LICENSE', license ? 'PASS' : 'NOT_RUN', license ? license : 'no LICENSE file (needed before publishing source publicly)', { required: false });

  const req = items.filter((i) => i.required);
  const verdict = req.some((i) => i.status === 'FAIL') ? 'NOT_READY' : req.some((i) => i.status === 'NOT_RUN') ? 'INCOMPLETE' : 'READY';
  const result = { verdict, commit: head || '(none)',items, cards: cards.filter((c) => !c._bad), brief };
  result.markdown = renderReady(result);
  fs.mkdirSync(path.join(root, REPORTS), { recursive: true });
  fs.writeFileSync(path.join(root, REPORTS, 'ready.md'), result.markdown);
  fs.writeFileSync(path.join(root, REPORTS, 'ready.json'), JSON.stringify({ ...result, markdown: undefined }, null, 2) + '\n');
  result.reportPath = path.join(REPORTS, 'ready.md');
  return result;
}

function firstPara(s) {
  return s ? s.split(/\n\s*\n/)[0].trim() : '_(missing)_';
}

function renderReady(r) {
  const L = [`# Release readiness: ${r.verdict}`, '', `Commit \`${r.commit}\``, ''];
  if (r.brief) {
    L.push('## What this is', '', firstPara(r.brief.Problem), '', `**For:** ${firstPara(r.brief.Users)}`, '');
    L.push('## Key decisions', '', r.brief.Decisions || '_(missing)_', '');
  }
  if (r.cards.length) {
    L.push('## Changes (from change cards)', '', '| Card | Type | Risk |', '|---|---|---|');
    for (const c of r.cards) L.push(`| ${c.title} | ${c.type} | ${c.risk} |`);
    L.push('');
  }
  L.push('## Evidence', '', '| Check | Status | Detail |', '|---|---|---|');
  for (const i of r.items) L.push(`| ${i.name}${i.required ? '' : ' (optional)'} | ${i.status} | ${String(i.detail).replace(/\|/g, '\\|')} |`);
  L.push('');
  for (const i of r.items.filter((x) => x.output && x.status === 'FAIL')) {
    L.push(`<details><summary>${i.name} output</summary>`, '', '```', i.output, '```', '</details>', '');
  }
  L.push('## Not tested / known limits', '', (r.brief && r.brief['Not tested / known limits']) || '_(missing)_', '');
  const later = r.cards.flatMap((c) => (Array.isArray(c.later) ? c.later : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => `- ${x} _(from: ${c.title})_`));
  if (later.length) L.push('## Follow-ups recorded as "later"', '', ...later, '');
  L.push(
    'READY means every required check above ran and passed on this commit. It is not a security audit or a code review,',
    'and it covers only what the checks exercise. Read "Not tested / known limits" before publishing.',
    ''
  );
  return L.join('\n');
}

module.exports = { ready, createBrief, parseBrief, BRIEF, BRIEF_SECTIONS };
