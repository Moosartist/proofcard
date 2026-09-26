'use strict';
// Parses "12.5" / "12,50" into integer cents; returns null when it is not a valid amount.
function toCents(text) {
  const t = String(text).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

const fmt = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

document.getElementById('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const error = document.getElementById('error');
  const result = document.getElementById('result');
  error.textContent = '';
  result.textContent = '';
  const billCents = toCents(document.getElementById('bill').value);
  const tipPercent = Number(document.getElementById('tip').value.trim().replace(',', '.') || '0');
  const people = Number(document.getElementById('people').value);
  if (billCents === null) { error.textContent = 'Enter the bill like 100 or 100.50'; return; }
  try {
    for (const share of window.splitBill({ billCents, tipPercent, people })) {
      const li = document.createElement('li');
      li.textContent = fmt(share);
      result.appendChild(li);
    }
  } catch (err) {
    error.textContent = err.message;
  }
});
