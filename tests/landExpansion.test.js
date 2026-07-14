const test = require('node:test');
const assert = require('node:assert/strict');

const { createDefaultState, normalizeState } = require('../server/defaultState');
const {
    LAND_UNLOCK_ORDER,
    MAX_PLOTS,
    STARTER_LAND_COUNT,
    getLandPurchasePrice,
    getLandRequiredLevel,
    getNextLandPlotId,
    isPlotUnlocked
} = require('../server/landConfig');

test('default state starts with eight unlocked land plots', () => {
    const state = createDefaultState();

    assert.equal(state.land.unlockedCount, STARTER_LAND_COUNT);
    assert.equal(state.plots.length, MAX_PLOTS);
    assert.equal(getNextLandPlotId(state.land), LAND_UNLOCK_ORDER[STARTER_LAND_COUNT]);
    LAND_UNLOCK_ORDER.slice(0, STARTER_LAND_COUNT).forEach((plotId) => {
        assert.equal(isPlotUnlocked(state.land, plotId), true);
    });
    assert.equal(isPlotUnlocked(state.land, LAND_UNLOCK_ORDER[STARTER_LAND_COUNT]), false);
});

test('starter plots form a four-by-two rectangle in the opposite direction', () => {
    assert.deepEqual(LAND_UNLOCK_ORDER.slice(0, STARTER_LAND_COUNT), [0, 1, 7, 8, 14, 15, 21, 22]);
});

test('legacy saves without land version are reset to starter land only', () => {
    const legacy = createDefaultState();
    delete legacy.land;
    legacy.plots[27] = {
        id: 27,
        state: 'mature',
        cropType: 'carrot',
        plantTime: 123,
        growthDuration: 1000
    };
    legacy.plots[0] = {
        id: 0,
        state: 'mature',
        cropType: 'corn',
        plantTime: 456,
        growthDuration: 1000
    };

    const normalized = normalizeState(legacy);

    assert.equal(normalized.land.unlockedCount, STARTER_LAND_COUNT);
    assert.equal(normalized.plots[27].state, 'empty');
    assert.equal(normalized.plots[27].cropType, null);
    assert.equal(normalized.plots[0].state, 'mature');
    assert.equal(normalized.plots[0].cropType, 'corn');
});

test('land unlocked count is clamped between starter and max plots', () => {
    assert.equal(normalizeState({ land: { version: 1, unlockedCount: 1 } }).land.unlockedCount, STARTER_LAND_COUNT);
    assert.equal(normalizeState({ land: { version: 1, unlockedCount: 99 } }).land.unlockedCount, MAX_PLOTS);
});

test('existing saves with fewer plots are upgraded to eight plots', () => {
    const normalized = normalizeState({
        land: { version: 1, unlockedCount: 4 },
        plots: Array.from({ length: MAX_PLOTS }, (_, id) => ({
            id,
            state: 'empty',
            cropType: null,
            plantTime: null,
            growthDuration: 0
        }))
    });

    assert.equal(normalized.land.unlockedCount, 8);
    LAND_UNLOCK_ORDER.slice(0, 8).forEach(plotId => {
        assert.equal(isPlotUnlocked(normalized.land, plotId), true);
    });
});

test('each later land plot costs more than the previous one', () => {
    assert.deepEqual(getLandPurchasePrice({ unlockedCount: 8 }), { gold: 10000, gems: 8 });
    assert.deepEqual(getLandPurchasePrice({ unlockedCount: 9 }), { gold: 15000, gems: 11 });
    assert.deepEqual(getLandPurchasePrice({ unlockedCount: 10 }), { gold: 22500, gems: 14 });
    const prices = Array.from(
        { length: MAX_PLOTS - STARTER_LAND_COUNT },
        (_, index) => getLandPurchasePrice({ unlockedCount: STARTER_LAND_COUNT + index })
    );
    prices.slice(1).forEach((price, index) => {
        assert.equal(price.gold, Math.round(prices[index].gold * 1.5));
        assert.ok(price.gems > prices[index].gems);
    });
    assert.equal(getLandPurchasePrice({ unlockedCount: MAX_PLOTS }), null);
});

test('new accounts start at level one with only carrot seeds', () => {
    const state = createDefaultState();
    assert.equal(state.level, 1);
    assert.equal(state.xp, 0);
    assert.equal(state.xpNeeded, 100);
    assert.deepEqual(state.inventory.seeds, {
        carrot: 10,
        corn: 0,
        tomato: 0,
        pumpkin: 0
    });
});

test('each additional land plot requires the next player level', () => {
    assert.equal(getLandRequiredLevel({ unlockedCount: 8 }), 2);
    assert.equal(getLandRequiredLevel({ unlockedCount: 9 }), 3);
    assert.equal(getLandRequiredLevel({ unlockedCount: 14 }), 8);
    assert.equal(getLandRequiredLevel({ unlockedCount: MAX_PLOTS }), null);
});
