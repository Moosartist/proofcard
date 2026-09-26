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
