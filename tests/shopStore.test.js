const test = require('node:test');
const assert = require('node:assert/strict');
const { effectivePrice, purchasePeriodKey } = require('../server/shopStore');

test('effective shop price prioritizes active flash sale', () => {
    const row = { buy_price: 100, sale_type: 'percent', sale_value: 20, flash_sale_price: 50,
        flash_sale_start: '2026-07-14T09:00:00Z', flash_sale_end: '2026-07-14T11:00:00Z', flash_stock_limit: 10, flash_sold_count: 2 };
    assert.deepEqual(effectivePrice(row, new Date('2026-07-14T10:00:00Z')), { price: 50, flashActive: true, discountActive: true });
});

test('expired or depleted flash sale returns configured discount price', () => {
    const row = { buy_price: 100, sale_type: 'fixed', sale_value: 15, flash_sale_price: 50,
        flash_sale_start: '2026-07-14T09:00:00Z', flash_sale_end: '2026-07-14T11:00:00Z', flash_stock_limit: 10, flash_sold_count: 10 };
    assert.equal(effectivePrice(row, new Date('2026-07-14T10:00:00Z')).price, 85);
    row.flash_sold_count = 0;
    assert.equal(effectivePrice(row, new Date('2026-07-14T12:00:00Z')).price, 85);
});

test('purchase periods are stable in Asia/Saigon', () => {
    const now = new Date('2026-07-14T18:00:00Z');
    assert.equal(purchasePeriodKey('daily', now), '2026-07-15');
    assert.match(purchasePeriodKey('weekly', now), /^2026-07-1[34]$/);
    assert.equal(purchasePeriodKey('account', now), 'account');
});
