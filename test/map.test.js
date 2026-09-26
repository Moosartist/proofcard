'use strict';
// The living map, end to end on examples/club-events and examples/messy-notes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildData, renderHtml } = require('../lib/view');

const CLI = path.join(__dirname, '..', 'bin', 'proofcard.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
delete ENV.NODE_TEST_CONTEXT;

const run = (args, cwd, cmd = process.execPath) => {
  const r = spawnSync(cmd, cmd === process.execPath ? [CLI, ...args] : args, { cwd, encoding: 'utf8', env: ENV });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const git = (args, cwd) => run(args, cwd, 'git');
const commit = (dir, msg) => { git(['add', '-A'], dir); git(['commit', '-q', '-m', msg], dir); };
const mapFile = (dir) => path.join(dir, '.proofcard', 'map.json');
const readMap = (dir) => JSON.parse(fs.readFileSync(mapFile(dir), 'utf8'));
const writeMap = (dir, m) => fs.writeFileSync(mapFile(dir), JSON.stringify(m, null, 2));
const checkJson = (dir) => JSON.parse(run(['map', 'check', '--json'], dir).out);
const codes = (res, feature) => res.findings.filter((f) => !feature || f.feature === feature).map((f) => f.code);
const edit = (dir, file, a, b) => {
  const p = path.join(dir, file);
  const s = fs.readFileSync(p, 'utf8');
  assert.ok(s.includes(a), `${file} contains ${a}`);
  fs.writeFileSync(p, s.replace(a, b));
};

function example(name, { confirm = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `proofcard-map-${name}-`));
  fs.cpSync(path.join(__dirname, '..', 'examples', name), dir, { recursive: true });
  git(['init', '-q', '-b', 'main'], dir);
  commit(dir, 'example');
  if (confirm) {
    for (const f of readMap(dir).features.filter((x) => x.status !== 'planned')) assert.strictEqual(run(['map', 'mark', f.id], dir).code, 0);
    commit(dir, 'confirm map');
  }
  return dir;
}

test('club-events: the map matches the code; built vs planned is explicit', () => {
  const dir = example('club-events');
  const res = checkJson(dir);
  assert.strictEqual(res.counts.error, 0, JSON.stringify(res.findings));
  assert.deepStrictEqual(readMap(dir).features.map((f) => `${f.id}:${f.status}`), ['list-events:built', 'sign-up:built', 'attendee-list:built', 'reminder:planned', 'cancel:built']);
  assert.deepStrictEqual(codes(res).filter((c) => !c.startsWith('OPEN_DEBT')), ['UNKNOWN_LINK'], 'only the unknown email provider remains');
  const show = run(['map', 'show', 'reminder'], dir).out;
  assert.match(show, /○ planned {2}src\/reminders\.js/);
  assert.match(show, /\? unknown {2}unknown/);
});

test('no invented links: a built step to a missing file is an error and is never rendered as a link', () => {
  const dir = example('club-events');
  git(['remote', 'add', 'origin', 'https://github.com/example/club-events.git'], dir);
  const m = readMap(dir);
  m.features.find((f) => f.id === 'sign-up').flow.push({ layer: 'service', does: 'ghost', file: 'src/ghost.js', find: 'function ghost' });
  writeMap(dir, m);
  const res = checkJson(dir);
  assert.ok(res.findings.some((f) => f.code === 'BROKEN_LINK' && f.file === 'src/ghost.js'));
  assert.strictEqual(run(['map', 'check'], dir).code, 1);
  const data = buildData(dir);
  const steps = data.features.find((f) => f.id === 'sign-up').flow;
  const ghost = steps.find((s) => s.file === 'src/ghost.js');
  assert.strictEqual(ghost.state, 'broken');
  assert.strictEqual(ghost.href, null);
  assert.ok(steps.filter((s) => s.state === 'confirmed').every((s) => /^https:\/\/github\.com\/example\/club-events\/blob\/[0-9a-f]{40}\/.+#L\d+$/.test(s.href)));
  const html = renderHtml(data);
  assert.doesNotMatch(html, /blob\/[0-9a-f]{40}\/src\/ghost\.js/);
});

test('planned vs built: text not written yet is "planned" in a planned feature, "stale" in a built one', () => {
  const dir = example('club-events');
  const m = readMap(dir);
  m.features.find((f) => f.id === 'reminder').flow.push({ layer: 'service', does: 'x', file: 'src/events.js', find: 'function notYetWritten' });
  m.features.find((f) => f.id === 'cancel').flow.push({ layer: 'service', does: 'x', file: 'src/events.js', find: 'function notYetWritten' });
  writeMap(dir, m);
  const res = checkJson(dir);
  assert.ok(!codes(res, 'reminder').includes('STALE_LINK'));
  assert.ok(codes(res, 'cancel').includes('STALE_LINK'));
});

test('after a change: drift and untouched tests are reported, ready refuses, and re-confirming clears it', () => {
  const dir = example('club-events');
  edit(dir, 'src/store.js', 'const tmp = `${file}.tmp`;', 'const tmp = `${file}.${process.pid}.tmp`;');
  commit(dir, 'change store');
  const res = checkJson(dir);
  for (const id of ['list-events', 'sign-up', 'attendee-list', 'cancel']) assert.ok(codes(res, id).includes('DRIFT'), id);
  assert.ok(codes(res, 'sign-up').includes('TESTS_NOT_UPDATED'));
  const ready = JSON.parse(run(['ready', '--json'], dir).out);
  assert.strictEqual(ready.items.find((i) => i.name === 'project map').status, 'FAIL');
  for (const id of ['list-events', 'sign-up', 'attendee-list', 'cancel']) run(['map', 'mark', id], dir);
  commit(dir, 'confirm');
  assert.ok(!codes(checkJson(dir)).includes('DRIFT'));
});

test('renaming a function the map cites makes the link stale; verify and mark refuse', () => {
  const dir = example('club-events');
  git(['checkout', '-q', '-b', 'rename'], dir);
  edit(dir, 'src/store.js', 'function update(change)', 'function applyChange(change)');
  edit(dir, 'src/store.js', 'return { load, update, file };', 'return { load, update: applyChange, file };');
  fs.writeFileSync(path.join(dir, '.proofcard/changes/rename.json'), JSON.stringify({ title: 'Rename update', type: 'refactor', risk: 'low' }));
  const v = run(['verify'], dir);
  assert.strictEqual(v.code, 1, v.out);
  assert.match(v.out, /\| project map \| FAIL \| sign-up: step \d \(data\): "function update" is no longer in src\/store\.js/);
  commit(dir, 'rename');
  assert.match(run(['map', 'mark', 'sign-up'], dir).out, /cannot confirm "sign-up"/);
});

test('impact of a file starts at the steps inside it and lists what to re-test', () => {
  const dir = example('club-events');
  const r = JSON.parse(run(['map', 'impact', 'src/store.js', '--json'], dir).out);
  assert.deepStrictEqual(r.direct.sort(), ['attendee-list', 'cancel', 'list-events', 'sign-up']);
  assert.ok(r.start.every((s) => s.first.file === 'src/store.js' && s.first.layer === 'data'));
  assert.deepStrictEqual(r.retest.sort(), ['test/api.test.js', 'test/concurrency.test.js', 'test/events.test.js']);
  assert.ok(r.debt.some((d) => d.id === 'multi-process'));
});

test('a new source file outside the map fails verify at medium risk, not at low risk', () => {
  const dir = example('club-events');
  git(['checkout', '-q', '-b', 'extra'], dir);
  fs.writeFileSync(path.join(dir, 'src/export.js'), "'use strict';\nmodule.exports = { toCsv: (rows) => rows.join('\\n') };\n");
  const card = (risk) => fs.writeFileSync(path.join(dir, '.proofcard/changes/x.json'), JSON.stringify({ title: 'Export', type: 'feature', risk, problem: 'p', must_not_change: ['x'], scope: ['src/**'] }));
  card('medium');
  assert.match(run(['verify'], dir).out, /\| project map \| FAIL \| src\/export\.js \(module\) is not part of any feature/);
  card('low');
  assert.match(run(['verify'], dir).out, /\| project map \| PASS \|/);
});

test('messy-notes: the scan finds the real mess, from the code only', () => {
  const dir = example('messy-notes', { confirm: false });
  const s = JSON.parse(run(['map', 'scan', '--json'], dir).out);
  const mess = s.mess.map((m) => `${m.type}:${m.file}`);
  assert.ok(mess.includes('orphan:old-utils.js'));
  assert.ok(mess.includes('mixed-responsibility:server.js'));
  assert.ok(mess.includes('unhandled-call:public/script.js'));
  const post = s.calls.find((c) => c.method === 'POST' && c.path === '/api/notes');
  assert.deepStrictEqual([post.handledBy.file, post.handledBy.line], ['server.js', 15]);
  assert.ok(s.files['server.js'].external.some((e) => e.what === 'https://api.example-translate.com'));
  const res = checkJson(dir);
  assert.strictEqual(res.counts.error, 0);
  assert.ok(res.findings.some((f) => f.code === 'UNMAPPED_FILE' && f.file === 'old-utils.js'));
  assert.ok(res.findings.some((f) => f.code === 'UNKNOWN_LINK' && f.feature === 'delete-note'));
});

test('a fresh idea: init + add gives a planned map with no errors and an HTML view', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcard-map-new-'));
  git(['init', '-q', '-b', 'main'], dir);
  assert.strictEqual(run(['init'], dir).code, 0);
  assert.strictEqual(run(['map', 'add', 'Upload a file', '--id', 'upload'], dir).code, 0);
  const m = readMap(dir);
  m.features[0].flow = [{ layer: 'screen', does: 'Upload button', file: 'public/upload.html', find: 'type="file"' }];
  writeMap(dir, m);
  assert.strictEqual(run(['map', 'check'], dir).code, 0);
  assert.match(run(['map', 'show', 'upload'], dir).out, /○ planned {2}public\/upload\.html/);
  assert.strictEqual(run(['map', 'view'], dir).code, 0);
  assert.match(fs.readFileSync(path.join(dir, '.proofcard/map.html'), 'utf8'), /Upload a file/);
});
