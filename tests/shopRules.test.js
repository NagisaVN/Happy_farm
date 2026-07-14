const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeShopPayload } = require('../server/shopRules');

const categories = [{ id: 1, code: 'seeds', catalog_entity_type: 'seed' }];
const valid = {
    categoryId: 1, name: 'Hạt thử nghiệm', code: 'test-seed', buyPrice: 100, sellPrice: 50,
    saleType: 'percent', saleValue: 20, purchaseLimitType: 'daily', purchaseLimit: 5,
    status: 'selling', flashSalePrice: 60, flashSaleStart: '2026-07-14T10:00:00Z',
    flashSaleEnd: '2026-07-14T11:00:00Z', flashStockLimit: 10
};

test('shop payload normalizes prices, category, sale and limits', () => {
    const item = normalizeShopPayload(valid, categories);
    assert.equal(item.entityType, 'seed');
    assert.equal(item.saleValue, 20);
    assert.equal(item.purchaseLimit, 5);
    assert.equal(item.flashSalePrice, 60);
});

test('shop validation rejects negative prices and excessive discounts', () => {
    assert.throws(() => normalizeShopPayload({ ...valid, buyPrice: -1 }, categories), /Giá mua/);
    assert.throws(() => normalizeShopPayload({ ...valid, saleValue: 101 }, categories), /100%/);
    assert.throws(() => normalizeShopPayload({ ...valid, saleType: 'fixed', saleValue: 101 }, categories), /lớn hơn giá mua/);
});

test('shop validation rejects invalid flash periods and purchase limits', () => {
    assert.throws(() => normalizeShopPayload({ ...valid, flashSaleEnd: '2026-07-14T09:00:00Z' }, categories), /kết thúc sau/);
    assert.throws(() => normalizeShopPayload({ ...valid, purchaseLimit: -2 }, categories), /Giới hạn mua/);
    assert.throws(() => normalizeShopPayload({ ...valid, purchaseLimit: 0 }, categories), /lớn hơn 0/);
});
