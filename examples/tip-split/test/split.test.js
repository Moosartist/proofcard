'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { splitBill } = require('../src/split');

const sum = (a) => a.reduce((s, x) => s + x, 0);

test('100.00 between 3 people adds up exactly', () => {
  assert.deepStrictEqual(splitBill({ billCents: 10000, tipPercent: 0, people: 3 }), [3334, 3333, 3333]);
});

test('tip is added before splitting', () => {
  assert.deepStrictEqual(splitBill({ billCents: 10000, tipPercent: 15, people: 2 }), [5750, 5750]);
});

test('shares always sum to bill + tip and differ by at most one cent', () => {
  for (let bill = 0; bill <= 5000; bill += 137) {
    for (const tip of [0, 10, 12.5, 18, 20]) {
      for (let people = 1; people <= 50; people += 7) {
        const shares = splitBill({ billCents: bill, tipPercent: tip, people });
        assert.strictEqual(sum(shares), bill + Math.round((bill * tip) / 100));
        assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
      }
    }
  }
});

test('invalid input is rejected instead of producing a number', () => {
  for (const bad of [
    { billCents: -1, tipPercent: 10, people: 2 },
    { billCents: 10.5, tipPercent: 10, people: 2 },
    { billCents: 100, tipPercent: -5, people: 2 },
    { billCents: 100, tipPercent: NaN, people: 2 },
    { billCents: 100, tipPercent: 10, people: 0 },
    { billCents: 100, tipPercent: 10, people: 51 },
    { billCents: 100, tipPercent: 10, people: 2.5 },
  ]) assert.throws(() => splitBill(bad), RangeError, JSON.stringify(bad));
});
