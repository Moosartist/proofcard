'use strict';
// The living map: features traced from what the user does to where the data ends up,
// every link pointing at a real file and checked against the code on every run.
const fs = require('fs');
const path = require('path');
const { git } = require('./proofcard');
const { scan } = require('./scan');

const MAP = path.join('.proofcard', 'map.json');
const LAYERS = ['screen', 'frontend', 'api', 'service', 'data', 'external'];
const STATUSES = ['planned', 'building', 'built'];
const OWNABLE = ['screen', 'frontend', 'backend', 'data', 'module'];

function mapPath(root) { return path.join(root, MAP); }

function loadMap(root) {
  const file = mapPath(root);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${MAP} is not valid JSON: ${e.message}`);
  }
}

function saveMap(root, map) {
  fs.mkdirSync(path.dirname(mapPath(root)), { recursive: true });
  fs.writeFileSync(mapPath(root), JSON.stringify(map, null, 2) + '\n');
}

function initMap(root, { name, summary } = {}) {
  if (loadMap(root)) return false;
  let pkgName = path.basename(root);
  try { pkgName = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name || pkgName; } catch { /* no package.json */ }
  saveMap(root, { version: 1, project: { name: name || pkgName, summary: summary || '' }, features: [] });
  return true;
}

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50); }

function addFeature(root, name, { id, status = 'planned', user_action = '' } = {}) {
  const map = loadMap(root);
  if (!map) throw new Error('no map yet; run `proofcard map init`');
  const fid = id || slug(name);
  if (map.features.some((f) => f.id === fid)) throw new Error(`feature "${fid}" already exists`);
  if (!STATUSES.includes(status)) throw new Error(`status must be one of ${STATUSES.join(', ')}`);
  map.features.push({ id: fid, name, status, user_action, flow: [], depends_on: [], tests: [], untested: [], decisions: [], debt: [] });
  saveMap(root, map);
  return fid;
}

// ---- resolving links against the code ----
function readText(root, file, cache) {
  if (!(file in cache)) {
    const p = path.join(root, file);
    cache[file] = fs.existsSync(p) && fs.statSync(p).isFile() ? fs.readFileSync(p, 'utf8') : null;
  }
  return cache[file];
}

// state: confirmed (file exists and cited text found), unverified (file exists, nothing cited),
// stale (cited text gone), planned (file not written yet, and that is expected),
// broken (file missing in a built feature), unknown (the map admits it does not know).
function resolveLink(root, link, feature, cache) {
  if (!link.file || link.file === 'unknown') return { state: 'unknown' };
  const text = readText(root, link.file, cache);
  if (text === null) {
    return { state: link.planned || feature.status === 'planned' ? 'planned' : 'broken' };
  }
  if (!link.find) return { state: 'unverified' };
  const i = text.indexOf(link.find);
  // Not written yet is expected for planned work; for built work it means the link went stale.
  if (i < 0) return { state: link.planned || feature.status === 'planned' ? 'planned' : 'stale' };
  return { state: 'confirmed', line: text.slice(0, i).split('\n').length };
}

function featureFiles(f) {
  return [...new Set([...(f.flow || []), ...(f.tests || [])].map((l) => l.file).filter((x) => x && x !== 'unknown'))];
}

function owners(map) {
  const own = {};
  for (const f of map.features) for (const file of featureFiles(f)) (own[file] = own[file] || new Set()).add(f.id);
  return own;
}

function changedSince(root, commit, files) {
  if (!files.length) return { ok: true, files: [] };
  try { git(['cat-file', '-e', `${commit}^{commit}`], root); } catch { return { ok: false, files: [] }; }
  const committed = git(['diff', '--relative', '--name-only', commit, 'HEAD', '--', ...files], root).split('\n');
  const working = git(['diff', '--relative', '--name-only', 'HEAD', '--', ...files], root).split('\n');
  return { ok: true, files: [...new Set([...committed, ...working].map((x) => x.trim()).filter(Boolean))] };
}

// ---- check: does the map still match reality? ----
function check(root, { map = loadMap(root), facts = scan(root) } = {}) {
  if (!map) throw new Error('no map yet; run `proofcard map init`');
  const findings = [];
  const add = (level, code, message, extra = {}) => findings.push({ level, code, message, ...extra });
  const cache = {};
  const ids = new Set();
  const resolved = {};

  for (const f of map.features) {
    if (ids.has(f.id)) add('error', 'DUPLICATE_ID', `two features use the id "${f.id}"`, { feature: f.id });
    ids.add(f.id);
  }
  for (const f of map.features) {
    const r = (resolved[f.id] = { flow: [], tests: [] });
    if (!STATUSES.includes(f.status)) add('error', 'BAD_STATUS', `status "${f.status}" is not one of ${STATUSES.join(', ')}`, { feature: f.id });
    for (const d of f.depends_on || []) if (!ids.has(d)) add('error', 'BAD_DEPENDS', `depends on "${d}", which is not a feature in the map`, { feature: f.id });

    for (const [kind, list] of [['flow', f.flow || []], ['tests', f.tests || []]]) {
      list.forEach((link, i) => {
        if (kind === 'flow' && !LAYERS.includes(link.layer)) add('error', 'BAD_LAYER', `step ${i + 1} has layer "${link.layer}" (use ${LAYERS.join(', ')})`, { feature: f.id });
        const res = resolveLink(root, link, f, cache);
        r[kind].push(res);
        const what = kind === 'tests' ? 'test' : `step ${i + 1} (${link.layer})`;
        if (res.state === 'broken') add('error', 'BROKEN_LINK', `${what} points to ${link.file}, which does not exist`, { feature: f.id, file: link.file });
        if (res.state === 'stale') add('error', 'STALE_LINK', `${what}: "${link.find}" is no longer in ${link.file}`, { feature: f.id, file: link.file });
        if (res.state === 'unknown' && kind === 'flow') add('warn', 'UNKNOWN_LINK', `${what} is marked unknown: "${link.does || ''}"`, { feature: f.id });
        if (res.state === 'unverified') add('info', 'UNVERIFIED_LINK', `${what} cites no text in ${link.file}, so the link is not checked`, { feature: f.id, file: link.file });
      });
    }
    const codeSteps = (f.flow || []).filter((l, i) => ['confirmed', 'unverified'].includes(r.flow[i].state));
    if (f.status === 'built' && !codeSteps.length) add('error', 'BUILT_NO_CODE', 'marked built, but no step points to existing code', { feature: f.id });
    if (f.status === 'planned' && (f.flow || []).length && r.flow.every((x) => x.state === 'confirmed')) add('info', 'PLANNED_EXISTS', 'marked planned, but every step already exists in the code: update status?', { feature: f.id });
    if (f.status === 'built' && !(f.tests || []).length) add('warn', 'NO_TESTS', 'built, but no test is linked', { feature: f.id });
    for (const d of (f.debt || []).filter((x) => x.status !== 'fixed')) add('info', 'OPEN_DEBT', `${d.kind || 'debt'}: ${d.text}`, { feature: f.id });

    // Drift: code changed since the map entry was last confirmed.
    if (f.status !== 'planned') {
      if (!f.checked) add('info', 'NEVER_CHECKED', 'never confirmed against the code; run `proofcard map mark ' + f.id + '` after reviewing it', { feature: f.id });
      else {
        const testFiles = (f.tests || []).map((t) => t.file).filter(Boolean);
        const ch = changedSince(root, f.checked.commit, featureFiles(f));
        if (!ch.ok) add('info', 'CHECK_COMMIT_MISSING', `last confirmed at ${String(f.checked.commit).slice(0, 7)}, which is not in this repo's history`, { feature: f.id });
        else if (ch.files.length) {
          const code = ch.files.filter((x) => !testFiles.includes(x));
          const tests = ch.files.filter((x) => testFiles.includes(x));
          add('warn', 'DRIFT', `changed since the map was confirmed (${String(f.checked.commit).slice(0, 7)}): ${ch.files.join(', ')}`, { feature: f.id });
          if (code.length && testFiles.length && !tests.length) add('warn', 'TESTS_NOT_UPDATED', `code changed (${code.join(', ')}) but none of its tests did`, { feature: f.id });
        }
      }
    }
  }

  // Project-level gaps, from scan facts.
  const own = owners(map);
  for (const fa of Object.values(facts.files)) {
    if (OWNABLE.includes(fa.kind) && !own[fa.file]) add('warn', 'UNMAPPED_FILE', `${fa.file} (${fa.kind}) is not part of any feature`, { file: fa.file });
  }
  const cited = (file) => map.features.flatMap((f) => (f.flow || []).filter((l) => l.file === file).map((l) => l.find || ''));
  // A route counts as cited only when a step quotes its path as a whole string, or "METHOD /path".
  const citesRoute = (t, r) => [`'${r.path}'`, `"${r.path}"`, `\`${r.path}\``, `${r.method} ${r.path}'`, `${r.method} ${r.path}"`].some((s) => t.includes(s));
  for (const r of facts.routes) {
    if (!cited(r.file).some((t) => citesRoute(t, r))) add('warn', 'UNMAPPED_ROUTE', `${r.method === '*' ? '' : r.method + ' '}${r.path} (${r.file}:${r.line}) is not cited by any feature`, { file: r.file });
  }
  for (const f of map.features) {
    const mine = new Set(featureFiles(f));
    const deps = new Set(f.depends_on || []);
    for (const file of mine) {
      const fa = facts.files[file];
      if (!fa) continue;
      for (const imp of fa.imports.filter((i) => i.to && !mine.has(i.to))) {
        const others = [...(own[imp.to] || [])].filter((o) => o !== f.id);
        if (others.length && !others.some((o) => deps.has(o))) add('warn', 'HIDDEN_COUPLING', `${file}:${imp.line} uses ${imp.to} (part of ${others.join(', ')}) but depends_on does not say so`, { feature: f.id, file });
      }
    }
    // A call in a shared file is explained if any feature using that file also maps the handler's file.
    const explained = (c) => [...(own[c.file] || [])].some((id) => featureFiles(map.features.find((x) => x.id === id)).includes(c.handledBy.file));
    for (const c of facts.calls.filter((c) => mine.has(c.file) && c.handledBy && !mine.has(c.handledBy.file) && !explained(c))) {
      add('warn', 'MISSING_STEP', `${c.file}:${c.line} calls ${c.method} ${c.path}, handled in ${c.handledBy.file}:${c.handledBy.line}, which is not in this feature's flow`, { feature: f.id, file: c.file });
    }
  }
  for (const m of facts.mess) add('info', 'MESS_' + m.type.toUpperCase().replace(/-/g, '_'), `${m.file}${m.line ? ':' + m.line : ''}: ${m.detail}`, { file: m.file });

  const counts = { error: 0, warn: 0, info: 0 };
  for (const x of findings) counts[x.level]++;
  return { findings, counts, resolved, map, facts };
}

// ---- impact: where to start and what to re-test ----
function impact(root, target, { map = loadMap(root), facts = scan(root) } = {}) {
  if (!map) throw new Error('no map yet; run `proofcard map init`');
  const own = owners(map);
  let direct = [];
  let files = [];
  const byId = Object.fromEntries(map.features.map((f) => [f.id, f]));
  if (byId[target]) {
    direct = [target];
    files = featureFiles(byId[target]);
  } else {
    const file = target.replace(/\\/g, '/');
    if (!facts.files[file] && !own[file]) throw new Error(`"${target}" is neither a feature id nor a file in this repo`);
    files = [file];
    direct = [...(own[file] || [])];
  }
  // Features reached through shared files, imports, or declared dependencies.
  const related = new Set();
  for (const file of files) {
    for (const o of own[file] || []) if (!direct.includes(o)) related.add(o);
    for (const importer of facts.importedBy[file] || []) for (const o of own[importer] || []) if (!direct.includes(o)) related.add(o);
  }
  for (const f of map.features) if ((f.depends_on || []).some((d) => direct.includes(d)) && !direct.includes(f.id)) related.add(f.id);
  const pick = (ids) => ids.map((id) => byId[id]).filter(Boolean);
  const retest = [...new Set([...pick(direct), ...pick([...related])].flatMap((f) => (f.tests || []).map((t) => t.file)))];
  const untested = pick(direct).flatMap((f) => (f.untested || []).map((u) => `${f.name}: ${u}`));
  const debt = pick(direct).flatMap((f) => (f.debt || []).filter((d) => d.status !== 'fixed').map((d) => ({ feature: f.id, ...d })));
  // Asking about a feature starts at its first step; asking about a file starts at the steps in that file.
  const start = pick(direct).map((f) => ({
    feature: f.id,
    name: f.name,
    first: (f.flow || []).find((l) => (byId[target] ? l.file && l.file !== 'unknown' : l.file === files[0])) || null,
  }));
  return { target, direct, related: [...related], files: [...new Set(pick(direct).flatMap(featureFiles).concat(files))], retest, untested, debt, start, unmapped: !direct.length };
}

// ---- mark: record that a feature's entry was reviewed against this commit ----
function mark(root, id) {
  const map = loadMap(root);
  if (!map) throw new Error('no map yet');
  const f = map.features.find((x) => x.id === id);
  if (!f) throw new Error(`no feature "${id}"`);
  const res = check(root, { map });
  const errors = res.findings.filter((x) => x.level === 'error' && x.feature === id);
  if (errors.length) throw new Error(`cannot confirm "${id}": ${errors.map((e) => e.message).join('; ')}`);
  const dirty = git(['status', '--porcelain', '--', ...featureFiles(f)], root).trim();
  if (dirty) throw new Error(`commit the changes to ${id}'s files first; the confirmation is tied to a commit`);
  f.checked = { commit: git(['rev-parse', 'HEAD'], root).trim(), date: new Date().toISOString().slice(0, 10) };
  saveMap(root, map);
  return f.checked;
}

// ---- terminal rendering ----
const ICON = { confirmed: '✓', unverified: '·', stale: '✗ STALE', broken: '✗ MISSING', planned: '○ planned', unknown: '? unknown' };

function showFeature(root, id, res = check(root)) {
  const f = res.map.features.find((x) => x.id === id);
  if (!f) throw new Error(`no feature "${id}"`);
  const r = res.resolved[f.id];
  const L = [`${f.name}  [${f.id}] — ${f.status}${f.checked ? `, map confirmed at ${f.checked.commit.slice(0, 7)} (${f.checked.date})` : ', map never confirmed'}`, ''];
  L.push(`What the user does: ${f.user_action || 'unknown'}`, '', 'What happens (screen → data):');
  (f.flow || []).forEach((s, i) => {
    const st = r.flow[i];
    const loc = s.file && s.file !== 'unknown' ? `${s.file}${st.line ? ':' + st.line : ''}` : 'unknown';
    L.push(`  ${i + 1}. [${s.layer}] ${s.does || ''}`, `     ${ICON[st.state]}  ${loc}${s.source === 'assistant' ? '  (inferred by assistant, needs review)' : ''}`);
  });
  if (f.depends_on && f.depends_on.length) L.push('', `Relies on features: ${f.depends_on.join(', ')}`);
  L.push('', 'Tested by:');
  if (!(f.tests || []).length) L.push('  (no linked tests)');
  (f.tests || []).forEach((t, i) => L.push(`  ${ICON[r.tests[i].state]}  ${t.file}${r.tests[i].line ? ':' + r.tests[i].line : ''}  "${t.find || ''}"`));
  if ((f.untested || []).length) L.push('', 'Not tested:', ...f.untested.map((u) => `  - ${u}`));
  if ((f.decisions || []).length) L.push('', 'Decisions:', ...f.decisions.map((d) => `  - ${d.decision} — ${d.why}`));
  if ((f.debt || []).length) L.push('', 'Known problems / debt:', ...f.debt.map((d) => `  - [${d.status || 'open'}] ${d.kind || 'debt'}: ${d.text}${d.files ? ` (${d.files.join(', ')})` : ''}`));
  const mine = res.findings.filter((x) => x.feature === f.id && x.level !== 'info');
  if (mine.length) L.push('', 'Map problems:', ...mine.map((x) => `  ${x.level.toUpperCase()} ${x.code}: ${x.message}`));
  return L.join('\n');
}

function renderCheck(res) {
  const L = [`Map check: ${res.counts.error} error(s), ${res.counts.warn} warning(s), ${res.counts.info} note(s)`, ''];
  const byFeature = {};
  for (const x of res.findings) (byFeature[x.feature || '(project)'] = byFeature[x.feature || '(project)'] || []).push(x);
  for (const [k, list] of Object.entries(byFeature)) {
    L.push(k === '(project)' ? 'Project' : `Feature ${k}`);
    for (const x of list.sort((a, b) => ['error', 'warn', 'info'].indexOf(a.level) - ['error', 'warn', 'info'].indexOf(b.level))) L.push(`  ${x.level.padEnd(5)} ${x.code}: ${x.message}`);
    L.push('');
  }
  L.push('Errors mean the map points at something that is not there. Warnings are gaps between the map and the code.');
  return L.join('\n');
}

module.exports = { MAP, LAYERS, STATUSES, loadMap, saveMap, initMap, addFeature, check, impact, mark, showFeature, renderCheck, featureFiles, resolveLink };
