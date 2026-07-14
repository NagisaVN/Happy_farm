const test = require('node:test');
const assert = require('node:assert/strict');

const { createDefaultState, normalizeState } = require('../server/defaultState');
const { getItemMeta, getStarterInventory, inventoryToRows, rowsToInventory } = require('../server/itemCatalog');

test('feed mill is a one-time 2000 gold building', () => {
    const meta = getItemMeta('buildings', 'feed_mill');
    assert.equal(meta.name, 'Máy trộn thức ăn');
    assert.equal(meta.minPrice, 2000);
    assert.equal(meta.maxPrice, 2000);
    assert.equal(getStarterInventory().buildings.feed_mill, 0);
});

test('building inventory serialization clamps feed mill ownership to one', () => {
    const rows = inventoryToRows({ buildings: { feed_mill: 9 } });
    assert.deepEqual(rows, [{ category: 'buildings', itemId: 'feed_mill', quantity: 1 }]);
    const inventory = rowsToInventory([{ category: 'buildings', item_id: 'feed_mill', quantity: 7 }]);
    assert.equal(inventory.buildings.feed_mill, 1);
});

test('new saves start without a placed feed mill', () => {
    const state = createDefaultState('Farm test');
    assert.equal(state.inventory.buildings.feed_mill, 0);
    assert.equal(state.layout.feedMill, null);
});

test('legacy active feed jobs receive a placed machine during migration', () => {
    const state = normalizeState({
        inventory: { seeds: {}, crops: {}, fertilizers: {}, feeds: {}, animalProducts: {} },
        animalProduction: {
            animals: {},
            feedMill: {
                activeJob: {
                    recipeId: 'chicken_feed',
                    startedAt: '2026-07-14T00:00:00.000Z',
                    readyAt: '2026-07-14T00:00:30.000Z'
                }
            }
        }
    });
    assert.equal(state.inventory.buildings.feed_mill, 1);
    assert.deepEqual(state.layout.feedMill, { left: 54, top: 27 });
});
