const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_CATALOG, parseJson } = require('../server/gameConfigStore');

test('default dynamic catalog covers crops, seeds, animals, items, shop and settings', () => {
    const types = new Set(DEFAULT_CATALOG.map(row => row[0]));
    ['crop', 'seed', 'animal', 'item', 'shop', 'setting'].forEach(type => assert.equal(types.has(type), true));
    assert.equal(DEFAULT_CATALOG.filter(row => row[0] === 'crop').length, 4);
});

test('catalog JSON parser safely handles database and malformed values', () => {
    assert.deepEqual(parseJson('{"active":true}'), { active: true });
    assert.deepEqual(parseJson('{bad'), {});
    assert.deepEqual(parseJson({ value: 1 }), { value: 1 });
});
