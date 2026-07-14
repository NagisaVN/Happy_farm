const LAND_VERSION = 1;
const MAX_PLOTS = 28;
const STARTER_LAND_COUNT = 8;
const LAND_UNLOCK_ORDER = [
    0, 1, 7, 8,
    14, 15, 21, 22,
    2, 9, 16, 3,
    10, 17, 4, 11,
    23, 5, 18, 12,
    24, 6, 19, 13,
    25, 20, 26, 27
];

function createDefaultPlot(id) {
    return {
        id,
        state: 'empty',
        cropType: null,
        plantTime: null,
        growthDuration: 0
    };
}

function clearPlot(_plot, id = 0) {
    return {
        id,
        state: 'empty',
        cropType: null,
        plantTime: null,
        growthDuration: 0
    };
}

function clampUnlockedLandCount(value) {
    const count = Number.parseInt(value, 10);
    if (!Number.isFinite(count)) return STARTER_LAND_COUNT;
    return Math.max(STARTER_LAND_COUNT, Math.min(MAX_PLOTS, count));
}

function normalizeLandMeta(land = {}) {
    return {
        version: LAND_VERSION,
        unlockedCount: clampUnlockedLandCount(land.unlockedCount)
    };
}

function getUnlockedPlotIds(land = {}) {
    const count = clampUnlockedLandCount(land.unlockedCount);
    return new Set(LAND_UNLOCK_ORDER.slice(0, count));
}

function isPlotUnlocked(land = {}, plotId) {
    const orderIndex = LAND_UNLOCK_ORDER.indexOf(Number(plotId));
    return orderIndex >= 0 && orderIndex < clampUnlockedLandCount(land.unlockedCount);
}

function getNextLandPlotId(land = {}) {
    const count = clampUnlockedLandCount(land.unlockedCount);
    return count >= MAX_PLOTS ? null : LAND_UNLOCK_ORDER[count];
}

function getLandPurchasePrice(landOrUnlockedCount = STARTER_LAND_COUNT) {
    const unlockedCount = typeof landOrUnlockedCount === 'object'
        ? clampUnlockedLandCount(landOrUnlockedCount?.unlockedCount)
        : clampUnlockedLandCount(landOrUnlockedCount);

    if (unlockedCount >= MAX_PLOTS) return null;

    const purchasedAfterStarter = unlockedCount - STARTER_LAND_COUNT;
    let gold = 10000;
    for (let index = 0; index < purchasedAfterStarter; index += 1) {
        gold = Math.round(gold * 1.5);
    }
    return {
        gold,
        gems: 8 + (purchasedAfterStarter * 3) + Math.floor((purchasedAfterStarter ** 2) / 6)
    };
}

function getLandRequiredLevel(landOrUnlockedCount = STARTER_LAND_COUNT) {
    const unlockedCount = typeof landOrUnlockedCount === 'object'
        ? clampUnlockedLandCount(landOrUnlockedCount?.unlockedCount)
        : clampUnlockedLandCount(landOrUnlockedCount);

    if (unlockedCount >= MAX_PLOTS) return null;
    return unlockedCount - STARTER_LAND_COUNT + 2;
}

function normalizePlotsForLand(plots = [], land = {}, { clearLocked = true } = {}) {
    const unlockedIds = getUnlockedPlotIds(land);
    return Array.from({ length: MAX_PLOTS }, (_, id) => {
        const plot = plots[id] ? { ...plots[id], id } : createDefaultPlot(id);
        if (clearLocked && !unlockedIds.has(id)) {
            return clearPlot(plot, id);
        }
        return plot;
    });
}

module.exports = {
    LAND_VERSION,
    MAX_PLOTS,
    STARTER_LAND_COUNT,
    LAND_UNLOCK_ORDER,
    createDefaultPlot,
    clearPlot,
    clampUnlockedLandCount,
    normalizeLandMeta,
    getUnlockedPlotIds,
    isPlotUnlocked,
    getNextLandPlotId,
    getLandPurchasePrice,
    getLandRequiredLevel,
    normalizePlotsForLand
};
