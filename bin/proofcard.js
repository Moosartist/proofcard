#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { verify, newCard, detectChecks, CONFIG } = require('../lib/proofcard');
const { ready, createBrief } = require('../lib/ready');
const mapLib = require('../lib/map');
const { scan, suggest } = require('../lib/scan');
const { buildData, renderHtml } = require('../lib/view');

const HELP = `proofcard — a living map of your project, checked against the code

  proofcard init [--claude] [--codex]   create ${CONFIG}, .proofcard/map.json and .proofcard/brief.md;
                                        --claude installs the Claude Code skill,
                                        --codex adds the workflow to AGENTS.md

The map
  proofcard map scan [--json]           facts from the code: files by part, routes, API calls,
                                        storage, outside services, tests, signs of mess,
                                        and entry points to draft features from
  proofcard map add "<name>" [--id x] [--status planned|building|built]
  proofcard map check [--json] [--strict]   does the map still match the code? (exit 1 on errors;
                                        --strict also fails on gaps)
  proofcard map show <feature>          one feature, screen to data, with link states
  proofcard map impact <file|feature>   where to start, what else is affected, what to re-test
  proofcard map mark <feature>          record that this entry was reviewed at the current commit
  proofcard map view [--out file] [--links github|none]   interactive HTML map

Changes and release
  proofcard new "<title>" [--type feature|bugfix|refactor|chore|docs] [--risk low|medium|high]
  proofcard verify [--card <slug|path>] [--base <ref>] [--json]   evidence for one change
  proofcard ready [--json]                                       is the committed project ready to publish?

Exit codes: verify 0 PASS, 1 FAIL, 2 INCOMPLETE; ready 0 READY, 1 NOT_READY, 2 INCOMPLETE.
INCOMPLETE means something required was NOT_RUN; it is never counted as passing.`;

function parse(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}

const PKG_ROOT = path.join(__dirname, '..');
const MARK_START = '<!-- proofcard:start -->';
const MARK_END = '<!-- proofcard:end -->';

function init(root, args) {
  const done = [];
  const cfgFile = path.join(root, CONFIG);
  if (fs.existsSync(cfgFile)) done.push(`${CONFIG} already exists (left unchanged)`);
  else {
    const checks = detectChecks(root);
    fs.writeFileSync(cfgFile, JSON.stringify({ base: 'main', checks }, null, 2) + '\n');
    done.push(`wrote ${CONFIG} with ${checks.length} check(s)${checks.length ? ': ' + checks.map((c) => c.name).join(', ') : ' — add your test/build commands to "checks"'}`);
  }
  if (mapLib.initMap(root)) done.push('wrote .proofcard/map.json — the project map (run `proofcard map scan` to see what the code contains)');
  if (createBrief(root)) done.push(`wrote .proofcard/brief.md — fill it in before building (proofcard ready checks it)`);
  const gi = path.join(root, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!giText.includes('.proofcard/reports')) {
    fs.writeFileSync(gi, giText + (giText && !giText.endsWith('\n') ? '\n' : '') + '.proofcard/reports/\n');
    done.push('added .proofcard/reports/ to .gitignore');
  }
  if (args.claude) {
    const dest = path.join(root, '.claude', 'skills', 'proofcard', 'SKILL.md');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(PKG_ROOT, 'skills', 'proofcard', 'SKILL.md'), dest);
    done.push('installed Claude Code skill at .claude/skills/proofcard/SKILL.md');
  }
  if (args.codex) {
    const agents = path.join(root, 'AGENTS.md');
    const snippet = fs.readFileSync(path.join(PKG_ROOT, 'integrations', 'AGENTS.snippet.md'), 'utf8').trim();
    const block = `${MARK_START}\n${snippet}\n${MARK_END}`;
    let text = fs.existsSync(agents) ? fs.readFileSync(agents, 'utf8') : '';
    const re = new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`);
    text = re.test(text) ? text.replace(re, block) : text + (text ? '\n\n' : '') + block + '\n';
    fs.writeFileSync(agents, text);
    done.push('added the Proofcard section to AGENTS.md (between proofcard markers)');
  }
  return done;
}

function renderScan(s) {
  const by = {};
  for (const f of Object.values(s.files)) (by[f.kind] = by[f.kind] || []).push(f.file);
  const L = [`Scanned ${Object.keys(s.files).length} files`, ''];
  for (const k of ['screen', 'frontend', 'backend', 'data', 'module', 'test', 'script', 'style', 'config', 'docs', 'other']) {
    if (by[k]) L.push(`${k.padEnd(9)} ${by[k].join(', ')}`);
  }
  const facts = Object.values(s.files);
  const list = (title, rows) => { if (rows.length) L.push('', title, ...rows.map((r) => `  ${r}`)); };
  list('Routes (server entry points):', s.routes.map((r) => `${r.method === '*' ? '' : r.method + ' '}${r.path}  ${r.file}:${r.line}`));
  list('API calls from the browser:', s.calls.map((c) => `${c.method} ${c.path}  ${c.file}:${c.line} → ${c.handledBy ? `${c.handledBy.file}:${c.handledBy.line}` : 'no handler found'}`));
  list('Where data is read/written:', facts.flatMap((f) => f.storage.map((x) => `${x.op}(${x.target})  ${f.file}:${x.line}`)));
  list('Outside services:', facts.flatMap((f) => f.external.map((x) => `${x.what}  ${f.file}:${x.line}`)));
  list('Environment variables:', facts.flatMap((f) => f.env.map((x) => `${x.name}  ${f.file}:${x.line}`)));
  list('Tests:', facts.filter((f) => f.tests.length).map((f) => `${f.file}: ${f.tests.map((t) => `"${t.name}"`).join(', ')}`));
  list('Signs of mess (hints, not verdicts):', s.mess.map((m) => `${m.type}: ${m.file}${m.line ? ':' + m.line : ''} — ${m.detail}`));
  const sug = suggest(s);
  list('Entry points to draft features from:', sug.map((x) => `${x.type === 'screen' ? 'screen ' + x.entry : x.route + '  ' + x.entry} → ${x.files.length} file(s)${x.apiCalls && x.apiCalls.length ? ', calls ' + x.apiCalls.map((c) => c.call).join(', ') : ''}${x.tests.length ? ', tests: ' + x.tests.join(', ') : ''}`));
  return L.join('\n');
}

function mapCommand(root, args) {
  const sub = args._[1];
  const arg = args._.slice(2).join(' ');
  if (sub === 'init') {
    console.log(mapLib.initMap(root, { name: args.name, summary: args.summary }) ? `Created ${mapLib.MAP.replace(/\\/g, '/')}` : 'Map already exists (left unchanged)');
    return 0;
  }
  if (sub === 'scan') {
    const s = scan(root);
    console.log(args.json ? JSON.stringify({ ...s, suggestions: suggest(s) }, null, 2) : renderScan(s));
    return 0;
  }
  if (sub === 'add') {
    const id = mapLib.addFeature(root, arg, { id: args.id, status: args.status, user_action: args['user-action'] });
    console.log(`Added feature "${id}" to ${mapLib.MAP.replace(/\\/g, '/')}. Fill in its flow, tests and decisions.`);
    return 0;
  }
  if (sub === 'check') {
    const res = mapLib.check(root);
    console.log(args.json ? JSON.stringify({ counts: res.counts, findings: res.findings }, null, 2) : mapLib.renderCheck(res));
    return res.counts.error ? 1 : args.strict && res.counts.warn ? 1 : 0;
  }
  if (sub === 'show') {
    if (!arg) throw new Error('usage: proofcard map show <feature-id>');
    console.log(mapLib.showFeature(root, arg));
    return 0;
  }
  if (sub === 'impact') {
    if (!arg) throw new Error('usage: proofcard map impact <file|feature-id>');
    const r = mapLib.impact(root, arg);
    if (args.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
    const L = [`Impact of ${r.target}`, ''];
    if (r.unmapped) L.push('Not part of any feature in the map. Map it before changing it, or say why it stands alone.', '');
    for (const s of r.start) L.push(`Start at: ${s.name} [${s.feature}] → ${s.first ? `${s.first.file} (${s.first.layer}: ${s.first.does || ''})` : 'no mapped step'}`);
    L.push(`Files involved: ${r.files.join(', ') || 'none'}`);
    L.push(`Also affected: ${r.related.length ? r.related.join(', ') : 'nothing else found in the map or import graph'}`);
    L.push(`Re-run these tests: ${r.retest.length ? r.retest.join(', ') : 'none linked — this change is not covered by any mapped test'}`);
    if (r.untested.length) L.push('Known untested parts:', ...r.untested.map((u) => `  - ${u}`));
    if (r.debt.length) L.push('Open problems here:', ...r.debt.map((d) => `  - [${d.feature}] ${d.kind || 'debt'}: ${d.text}`));
    console.log(L.join('\n'));
    return 0;
  }
  if (sub === 'mark') {
    if (!arg) throw new Error('usage: proofcard map mark <feature-id>');
    const c = mapLib.mark(root, arg);
    console.log(`Confirmed "${arg}" at ${c.commit.slice(0, 7)}. Later changes to its files will show as drift until it is reviewed and marked again.`);
    return 0;
  }
  if (sub === 'view') {
    const out = path.resolve(root, args.out || path.join('.proofcard', 'map.html'));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, renderHtml(buildData(root, { links: args.links })));
    console.log(`Wrote ${path.relative(root, out)} — open it in a browser.`);
    return 0;
  }
  console.log(HELP);
  return 64;
}

function main() {
  const args = parse(process.argv.slice(2));
  const cmd = args._[0];
  const root = process.cwd();
  try {
    if (cmd === 'init') {
      init(root, args).forEach((l) => console.log(`✓ ${l}`));
      return 0;
    }
    if (cmd === 'new') {
      const file = newCard(root, { title: args._.slice(1).join(' '), type: args.type, risk: args.risk, slug: args.slug });
      console.log(`Created ${file}. Fill in every TODO before \`proofcard verify\`.`);
      return 0;
    }
    if (cmd === 'verify') {
      const r = verify(root, { card: args.card, base: args.base });
      if (args.json) console.log(JSON.stringify({ ...r, markdown: undefined }, null, 2));
      else console.log(r.markdown + `Report saved to ${r.reportPath}`);
      return { PASS: 0, FAIL: 1, INCOMPLETE: 2 }[r.verdict];
    }
    if (cmd === 'ready') {
      const r = ready(root);
      if (args.json) console.log(JSON.stringify({ ...r, markdown: undefined }, null, 2));
      else console.log(r.markdown + `Report saved to ${r.reportPath}`);
      return { READY: 0, NOT_READY: 1, INCOMPLETE: 2 }[r.verdict];
    }
    if (cmd === 'map') return mapCommand(root, args);
    console.log(HELP);
    return cmd && cmd !== 'help' && cmd !== '--help' ? 64 : 0;
  } catch (e) {
    console.error(`proofcard: ${e.message}`);
    return 1;
  }
}

process.exitCode = main();
