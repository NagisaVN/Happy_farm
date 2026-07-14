const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCatalogPayload, normalizeEventPayload } = require('../server/adminRules');

test('admin catalog payload is normalized and bounded', () => {
    const item = normalizeCatalogPayload({ entityType: 'crop', code: 'Red Carrot!', name: ' Cà rốt đỏ ', buyPrice: -5, sellPrice: 90, unlockLevel: 0, config: { icon: '🥕' } });
    assert.equal(item.code, 'red_carrot_');
    assert.equal(item.name, 'Cà rốt đỏ');
    assert.equal(item.buyPrice, 0);
    assert.equal(item.unlockLevel, 1);
});

test('admin catalog rejects unknown entity types', () => {
    assert.throws(() => normalizeCatalogPayload({ entityType: 'unknown', code: 'x', name: 'X' }), /không hợp lệ/);
});

test('events require a valid increasing date range', () => {
    assert.throws(() => normalizeEventPayload({ name: 'Tết', startsAt: '2026-02-10', endsAt: '2026-02-01' }), /không hợp lệ/);
    assert.equal(normalizeEventPayload({ name: 'Tết', startsAt: '2026-02-01', endsAt: '2026-02-10' }).name, 'Tết');
});
