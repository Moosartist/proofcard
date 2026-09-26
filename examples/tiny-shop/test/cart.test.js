'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cartTotal } = require('../src/cart');

test('single item without discount', () => {
  assert.strictEqual(cartTotal([{ priceCents: 1000, qty: 1 }]), 1000);
});

test('percentage discount', () => {
  assert.strictEqual(cartTotal([{ priceCents: 1000, qty: 1 }], 10), 900);
});
