// Splits a bill plus tip between people in integer cents.
// Works in Node (require) and in the browser (window.splitBill) without a build step.
(function (root) {
  'use strict';

  const MAX_BILL_CENTS = 1000000000; // 10,000,000.00
  const MAX_PEOPLE = 50;

  function splitBill({ billCents, tipPercent, people }) {
    if (!Number.isInteger(billCents) || billCents < 0 || billCents > MAX_BILL_CENTS) {
      throw new RangeError('bill must be between 0 and 10,000,000.00');
    }
    if (typeof tipPercent !== 'number' || !Number.isFinite(tipPercent) || tipPercent < 0 || tipPercent > 100) {
      throw new RangeError('tip must be between 0 and 100 percent');
    }
    if (!Number.isInteger(people) || people < 1 || people > MAX_PEOPLE) {
      throw new RangeError(`people must be a whole number from 1 to ${MAX_PEOPLE}`);
    }
    const tipCents = Math.round((billCents * tipPercent) / 100);
    const total = billCents + tipCents;
    const base = Math.floor(total / people);
    const extra = total - base * people; // 0 .. people-1 leftover cents
    return Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0));
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { splitBill, MAX_PEOPLE };
  else root.splitBill = splitBill;
})(this);
