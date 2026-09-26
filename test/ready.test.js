'use strict';
// End-to-end proof of `proofcard ready` on the worked example in examples/tip-split.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'proofcard.js');
const EXAMPLE = path.join(__dirname, '..', 'examples', 'tip-split');
const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};
delete ENV.NODE_TEST_CONTEXT; // let the example's own node --test really run

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: ENV });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const commit = (dir, msg) => { run('git', ['add', '-A'], dir); run('git', ['commit', '-q', '-m', msg], dir); };
const ready = (dir) => {
  const r = run(process.execPath, [CLI, 'ready', '--json'], dir);
  return { code: r.code, json: JSON.parse(r.out), raw: r.out };
};
const status = (json, name) => (json.items.find((i) => i.name === name) || {}).status;

function example() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcard-ready-'));
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  run('git', ['init', '-q', '-b', 'main'], dir);
  commit(dir, 'example');
  return dir;
}

function attest(dir) {
  const f = path.join(dir, '.proofcard/changes/web-page-and-server.json');
  const card = JSON.parse(fs.readFileSync(f, 'utf8'));
  card.review = { reviewer: 'Test Reviewer', notes: 'read server.js routing and smoke test' };
  fs.writeFileSync(f, JSON.stringify(card, null, 2));
  commit(dir, 'review attestation');
}

test('worked example as published: everything passes except the missing review attestation → INCOMPLETE', () => {
  const dir = example();
  const { code, json } = ready(dir);
  assert.strictEqual(code, 2);
  assert.strictEqual(json.verdict, 'INCOMPLETE');
  const notPassing = json.items.filter((i) => i.required && i.status !== 'PASS').map((i) => `${i.name}:${i.status}`);
  assert.deepStrictEqual(notPassing, ['review attestations (unverified):NOT_RUN']);
  assert.strictEqual(status(json, 'smoke check'), 'PASS');
});

test('after a review attestation is committed the example is READY, and the report still calls it unverified', () => {
  const dir = example();
  attest(dir);
  const r = run(process.execPath, [CLI, 'ready'], dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /# Release readiness: READY/);
  assert.match(r.out, /review attestations \(unverified\) \| PASS \| every high-risk card names a reviewer; these are declarations, not verified by Proofcard/);
  assert.match(r.out, /## Not tested \/ known limits\n\n- Automated:/);
  assert.match(r.out, /## What this is\n\nAt the end of a group meal/);
});

test('a brand-new repo with no commits is NOT_READY, not a crash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcard-ready-'));
  run('git', ['init', '-q', '-b', 'main'], dir);
  assert.strictEqual(run(process.execPath, [CLI, 'init'], dir).code, 0);
  const { code, json } = ready(dir);
  assert.strictEqual(code, 1);
  assert.strictEqual(status(json, 'committed state'), 'FAIL');
  assert.match(json.items.find((i) => i.name === 'project brief').detail, /empty or TODO: Problem, Users/);
});

test('uncommitted work, a committed .env file and a failing smoke check each block READY', () => {
  const dir = example();
  attest(dir);
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'wip');
  assert.strictEqual(status(ready(dir).json, 'committed state'), 'FAIL');

  fs.rmSync(path.join(dir, 'notes.txt'));
  fs.writeFileSync(path.join(dir, '.env'), 'PORT=3000\n');
  run('git', ['add', '-f', '.env'], dir);
  commit(dir, 'oops env');
  const env = ready(dir);
  assert.strictEqual(env.code, 1);
  assert.match(env.json.items.find((i) => i.name === 'secret scan (whole repo)').detail, /\.env is a committed env file/);

  run('git', ['rm', '-q', '.env'], dir);
  fs.writeFileSync(path.join(dir, 'server.js'), fs.readFileSync(path.join(dir, 'server.js'), 'utf8').replace("'/': ['public/index.html'", "'/': ['public/missing.html'"));
  commit(dir, 'break page');
  const smoke = ready(dir);
  assert.strictEqual(smoke.code, 1);
  assert.strictEqual(status(smoke.json, 'smoke check'), 'FAIL');
});

test('no smoke command means INCOMPLETE: never having started the app is not READY', () => {
  const dir = example();
  attest(dir);
  const cfgFile = path.join(dir, 'proofcard.json');
  const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  delete cfg.smoke;
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  commit(dir, 'drop smoke');
  const { code, json } = ready(dir);
  assert.strictEqual(code, 2);
  assert.strictEqual(status(json, 'smoke check'), 'NOT_RUN');
});
