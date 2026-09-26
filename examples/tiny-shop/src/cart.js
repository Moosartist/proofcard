'use strict';

// Returns the cart total in cents after an optional percentage discount.
// Known bug (kept on purpose for the demo): quantity is ignored.
function cartTotal(items, discountPercent = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.priceCents, 0);
  return Math.round(subtotal * (1 - discountPercent / 100));
}

module.exports = { cartTotal };
