'use strict';
// End-to-end proof: each test copies examples/tiny-shop into a fresh git repo,
// makes a change the way an AI assistant would, and runs the real CLI.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', 'bin', 'proofcard.js');
const EXAMPLE = path.join(__dirname, '..', 'examples', 'tiny-shop');
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com',
};
delete GIT_ENV.NODE_TEST_CONTEXT; // let the fixture's own node --test really run

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: GIT_ENV });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function fixture({ config = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcard-test-'));
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  if (config) fs.writeFileSync(path.join(dir, 'proofcard.json'), JSON.stringify({ base: 'main', checks: [{ name: 'test', run: 'node --test' }] }));
  run('git', ['init', '-q', '-b', 'main'], dir);
  run('git', ['add', '-A'], dir);
  run('git', ['commit', '-q', '-m', 'base'], dir);
  return dir;
}

const write = (dir, file, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};
const card = (dir, slug, obj) => write(dir, `.proofcard/changes/${slug}.json`, JSON.stringify(obj, null, 2));
const verify = (dir, ...args) => run(process.execPath, [CLI, 'verify', ...args], dir);

const mediumFields = {
  facts: ['src/cart.js:6 sums priceCents only'],
  assumptions: [],
  must_not_change: ['cartTotal signature', 'discount behaviour'],
  scope: ['src/**', 'test/**'],
};

const FIX = `'use strict';

// Returns the cart total in cents after an optional percentage discount.
function cartTotal(items, discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.priceCents * (item.qty ?? 1), 0);
  return Math.round(subtotal * (1 - discountPercent / 100));
}

module.exports = { cartTotal };
`;

const REGRESSION_TEST = `'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cartTotal } = require('../src/cart');

test('quantity is multiplied into the total', () => {
  assert.strictEqual(cartTotal([{ priceCents: 250, qty: 4 }]), 1000);
});
`;

test('feature: starts from a requirement and ends with a checkable PASS', () => {
  const dir = fixture();
  card(dir, 'format-price', {
    title: 'Add formatPrice for receipts', type: 'feature', risk: 'medium',
    problem: 'Receipts need prices as "12.50 USD" from integer cents.', ...mediumFields,
  });
  write(dir, 'src/format.js', "'use strict';\nmodule.exports.formatPrice = (c) => `${(c / 100).toFixed(2)} USD`;\n");
  write(dir, 'test/format.test.js', "const t=require('node:test');const a=require('node:assert');const {formatPrice}=require('../src/format');\nt('formats cents',()=>a.strictEqual(formatPrice(1250),'12.50 USD'));\n");
  const r = verify(dir);
  assert.strictEqual(r.code, 0, r.out);
  assert.match(r.out, /# Proofcard: PASS/);
  assert.match(r.out, /\| check: test \| PASS \|/);
  assert.match(r.out, /\| scope \| PASS \|/);
});

test('known bug: regression test fails before the fix and passes after', () => {
  const dir = fixture();
  card(dir, 'qty-ignored', {
    title: 'cartTotal ignores qty', type: 'bugfix', risk: 'medium',
    problem: 'Reproduced: cartTotal([{priceCents:250,qty:4}]) returns 250, expected 1000. Cause: reduce never reads qty.',
    ...mediumFields,
    regression: { command: 'node --test test/qty.test.js', files: ['test/qty.test.js'] },
  });
  write(dir, 'test/qty.test.js', REGRESSION_TEST);
  // Before the fix the gate must refuse: the project check itself fails.
  const before = verify(dir);
  assert.strictEqual(before.code, 1, before.out);
  assert.match(before.out, /# Proofcard: FAIL/);

  write(dir, 'src/cart.js', FIX);
  const after = verify(dir);
  assert.strictEqual(after.code, 0, after.out);
  assert.match(after.out, /\| regression proof \| PASS \| fails before the fix \(exit [1-9]\d*\), passes after \(exit 0\)/);
});

test('bug fix with a test that never detected the bug is FAIL, not PASS', () => {
  const dir = fixture();
  card(dir, 'weak-test', {
    title: 'cartTotal ignores qty', type: 'bugfix', risk: 'medium', problem: 'qty ignored', ...mediumFields,
    regression: { command: 'node --test test/weak.test.js', files: ['test/weak.test.js'] },
  });
  write(dir, 'test/weak.test.js', "const t=require('node:test');const a=require('node:assert');const {cartTotal}=require('../src/cart');\nt('qty 1',()=>a.strictEqual(cartTotal([{priceCents:5,qty:1}]),5));\n");
  write(dir, 'src/cart.js', FIX);
  const r = verify(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /regression proof \| FAIL \| regression test PASSES on the code before the fix/);
});

test('failing check: the report never calls it PASS', () => {
  const dir = fixture();
  card(dir, 'broken', { title: 'Change discount', type: 'feature', risk: 'medium', problem: 'x', ...mediumFields });
  write(dir, 'src/cart.js', FIX.replace('1 - discountPercent / 100', '1 - discountPercent / 10'));
  const r = verify(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /# Proofcard: FAIL/);
  assert.doesNotMatch(r.out, /# Proofcard: PASS/);
  assert.match(r.out, /\| check: test \| FAIL \| `node --test` exited [1-9]/);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, '.proofcard/reports/broken.json'), 'utf8'));
  assert.strictEqual(saved.verdict, 'FAIL');
});

test('low-risk change: only card, secret scan and checks — no extra stages', () => {
  const dir = fixture();
  card(dir, 'readme-typo', { title: 'Fix README typo', type: 'docs', risk: 'low' });
  write(dir, 'README.md', fs.readFileSync(path.join(dir, 'README.md'), 'utf8').replace('deliberately', 'intentionally'));
  const r = verify(dir, '--json');
  assert.strictEqual(r.code, 0, r.out);
  const json = JSON.parse(r.out);
  assert.deepStrictEqual(json.items.map((i) => i.name), ['change card', 'secret scan (added lines)', 'check: test']);
});

test('change outside the declared scope is FAIL', () => {
  const dir = fixture();
  card(dir, 'scoped', { title: 'Tweak cart', type: 'refactor', risk: 'medium', problem: 'x', ...mediumFields, scope: ['src/cart.js'] });
  write(dir, 'src/cart.js', FIX);
  write(dir, 'package.json', fs.readFileSync(path.join(dir, 'package.json'), 'utf8').replace('1.0.0', '1.0.1'));
  const r = verify(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /\| scope \| FAIL \| changed outside declared scope: package.json/);
});

test('secret-looking value in added lines is FAIL', () => {
  const dir = fixture();
  card(dir, 'config', { title: 'Add client', type: 'feature', risk: 'low' });
  const fake = 'sk-' + 'x'.repeat(8) + 'FAKEFAKEFAKE1234';
  write(dir, 'src/client.js', `module.exports = { key: '${fake}' };\n`);
  const r = verify(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /secret scan \(added lines\) \| FAIL \| src\/client.js:1 looks like a API key/);
  assert.doesNotMatch(r.out, new RegExp(fake), 'report must not echo the secret');
});

test('high risk without a named reviewer is INCOMPLETE, not PASS', () => {
  const dir = fixture();
  card(dir, 'pay', {
    title: 'Change discount rules', type: 'feature', risk: 'high', problem: 'x', ...mediumFields,
    design: 'cart -> total', security: 'ASVS V5 input validation: discount clamped', review: { reviewer: '', notes: '' },
  });
  write(dir, 'src/cart.js', FIX);
  const r = verify(dir);
  assert.strictEqual(r.code, 2, r.out);
  assert.match(r.out, /# Proofcard: INCOMPLETE/);
  assert.match(r.out, /human review \| NOT_RUN/);
});

test('TODO placeholders and missing checks are not PASS', () => {
  const dir = fixture({ config: false });
  assert.strictEqual(run(process.execPath, [CLI, 'new', 'Fix qty', '--type', 'bugfix', '--risk', 'medium'], dir).code, 0);
  const r = verify(dir);
  assert.strictEqual(r.code, 1, r.out);
  assert.match(r.out, /change card \| FAIL \| missing or TODO for medium risk: problem, must_not_change, scope/);
  assert.match(r.out, /project checks \| NOT_RUN \| no proofcard.json/);
});

test('init detects checks and installs Claude Code + Codex integrations idempotently', () => {
  const dir = fixture({ config: false });
  for (let i = 0; i < 2; i++) assert.strictEqual(run(process.execPath, [CLI, 'init', '--claude', '--codex'], dir).code, 0);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'proofcard.json'), 'utf8'));
  assert.deepStrictEqual(cfg.checks, [{ name: 'test', run: 'npm test' }]); // portable: no npm.cmd
  assert.ok(fs.existsSync(path.join(dir, '.claude/skills/proofcard/SKILL.md')));
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.strictEqual(agents.split('<!-- proofcard:start -->').length, 2);
});
