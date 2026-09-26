'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { globToRegExp, scanSecrets } = require('../lib/proofcard');

test('globToRegExp', () => {
  assert.ok(globToRegExp('src/**').test('src/a/b.js'));
  assert.ok(globToRegExp('src/**/*.js').test('src/x.js'));
  assert.ok(globToRegExp('src/*.js').test('src/x.js'));
  assert.ok(!globToRegExp('src/*.js').test('src/a/x.js'));
  assert.ok(!globToRegExp('src/**').test('srcx/a.js'));
});

test('scanSecrets flags credentials but honours the allow marker', () => {
  const pk = '-----BEGIN RSA ' + 'PRIVATE KEY-----';
  assert.strictEqual(scanSecrets([{ file: 'a', line: 1, text: pk }]).length, 1);
  assert.strictEqual(scanSecrets([{ file: 'a', line: 1, text: `password = "hunter2hunter2"` }]).length, 1);
  assert.strictEqual(scanSecrets([{ file: 'a', line: 1, text: `password = "hunter2hunter2" // proofcard:allow-secret` }]).length, 0);
  assert.strictEqual(scanSecrets([{ file: 'a', line: 1, text: 'const total = price * qty;' }]).length, 0);
});

test('action.yml never writes into the checked-out workspace while verify runs', () => {
  // Regression: v0.1.0 tee'd output to ./proofcard-out.md, which verify then saw as an out-of-scope change.
  const action = require('fs').readFileSync(require('path').join(__dirname, '..', 'action.yml'), 'utf8');
  for (const m of action.matchAll(/(?:tee|>>?)\s+"?([^"\s|]+)/g)) {
    assert.match(m[1], /^\$(RUNNER_TEMP|GITHUB_STEP_SUMMARY|out)\b/, `writes to ${m[1]}`);
  }
  assert.match(action, /out="\$RUNNER_TEMP\//);
});
