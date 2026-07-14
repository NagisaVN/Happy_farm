const { getStarterInventory } = require('./itemCatalog');
const {
    LAND_VERSION,
    MAX_PLOTS,
    STARTER_LAND_COUNT,
    createDefaultPlot,
    normalizeLandMeta,
    normalizePlotsForLand
} = require('./landConfig');

const DEFAULT_ANIMAL_IDS = [
    ['chicken-1', 'chicken'],
    ['chicken-2', 'chicken'],
    ['chicken-3', 'chicken'],
    ['cow-1', 'cow'],
    ['cow-2', 'cow'],
    ['pig-1', 'pig'],
    ['pig-2', 'pig']
];

function createAnimalRecord(type) {
    return {
        type,
        status: 'hungry',
        fedAt: null,
        readyAt: null
    };
}

function createDefaultAnimalProduction() {
    return {
        animals: Object.fromEntries(DEFAULT_ANIMAL_IDS.map(([id, type]) => [id, createAnimalRecord(type)])),
        feedMill: {
            activeJob: null
        }
    };
}

function createDefaultState(farmName = 'Happy Farm', systemSettings = {}) {
    const startGold = Math.max(0, Number.parseInt(systemSettings.START_GOLD, 10) || 12450);
    const startLevel = Math.max(1, Number.parseInt(systemSettings.START_LEVEL, 10) || 1);
    const defaultExp = Math.max(1, Number.parseInt(systemSettings.DEFAULT_EXP, 10) || 100);
    const defaultLandSize = Math.max(1, Math.min(MAX_PLOTS, Number.parseInt(systemSettings.DEFAULT_LAND_SIZE, 10) || STARTER_LAND_COUNT));
    const defaultInventory = systemSettings.DEFAULT_INVENTORY && typeof systemSettings.DEFAULT_INVENTORY === 'object'
        ? JSON.parse(JSON.stringify(systemSettings.DEFAULT_INVENTORY))
        : getStarterInventory();
    return {
        farmName,
        coins: startGold,
        gems: 35,
        energy: 120,
        maxEnergy: 120,
        level: startLevel,
        xp: 0,
        xpNeeded: defaultExp,
        inventory: defaultInventory,
        animalProduction: createDefaultAnimalProduction(),
        land: {
            version: LAND_VERSION,
            unlockedCount: defaultLandSize
        },
        plots: Array.from({ length: MAX_PLOTS }, (_, i) => createDefaultPlot(i)),
        quests: [
            { id: 1, title: 'Người gieo mầm', desc: 'Trồng 5 hạt giống Cà rốt', target: 5, current: 0, rewardCoins: 150, rewardXp: 50, claimed: false, action: 'plant', type: 'carrot' },
            { id: 2, title: 'Mùa vụ đầu tiên', desc: 'Thu hoạch 5 Bắp ngô', target: 5, current: 0, rewardCoins: 300, rewardXp: 100, claimed: false, action: 'harvest', type: 'corn' },
            { id: 3, title: 'Nhà buôn nông sản', desc: 'Rao bán 5 Cà chua ở quầy hàng', target: 5, current: 0, rewardCoins: 500, rewardXp: 150, claimed: false, action: 'sell', type: 'tomato' }
        ],
        achievements: [
            { id: 1, title: 'Nông dân tập sự', desc: 'Trồng tổng cộng 10 cây trồng', key: 'plantedTotal', target: 10, unlocked: false, rewardGems: 5 },
            { id: 2, title: 'Bàn tay vàng', desc: 'Thu hoạch tổng cộng 20 lần', key: 'harvestedTotal', target: 20, unlocked: false, rewardGems: 10 },
            { id: 3, title: 'Triệu phú nông thôn', desc: 'Kiếm được tổng cộng 20,000 vàng', key: 'coinsEarnedTotal', target: 20000, unlocked: false, rewardGems: 20 }
        ],
        stats: {
            plantedTotal: 0,
            harvestedTotal: 0,
            coinsEarnedTotal: startGold,
            coinsSpentTotal: 0,
            timePlayed: 0
        },
        settings: {
            sfx: true,
            bgm: false
        },
        pets: {
            shiba: { name: 'Cún Shiba', active: true, unlocked: true },
            cat: { name: 'Mèo Tam Thể', active: false, unlocked: false, cost: 50 }
        },
        layout: {
            farmhouse: { left: 21.5, top: -4 },
            barn: { left: 60.5, top: -9.5 },
            farmGrid: { left: 48, top: 54 },
            shopBuilding: { left: 10, top: 35 },
            petBuilding: { left: 48, top: 15 },
            questBuilding: { left: 80, top: 30 },
            achieveBuilding: { left: 85, top: 50 },
            signpost: { left: 36, top: 12 },
            chickenCoop: { left: 10, top: 56 },
            cowPen: { left: 70, top: 18 },
            pigPen: { left: 80, top: 62 },
            feedMill: null,
            decorations: [],
            pavedPaths: []
        },
        pavedPaths: []
    };
}

function mergeDeep(target, ...sources) {
    for (const source of sources) {
        if (!source || typeof source !== 'object') continue;
        Object.entries(source).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
                    target[key] = {};
                }
                mergeDeep(target[key], value);
            } else {
                target[key] = value;
            }
        });
    }
    return target;
}

function normalizeState(input, farmName = 'Happy Farm') {
    const hadBuildingInventory = Boolean(input?.inventory?.buildings);
    const legacyFeedMillJob = input?.animalProduction?.feedMill?.activeJob;
    const hasLandVersion = Number(input?.land?.version) === LAND_VERSION;
    const state = mergeDeep(createDefaultState(farmName), input || {});
    state.farmName = String(state.farmName || farmName || 'Happy Farm').slice(0, 64);
    state.coins = Math.max(0, Number.parseInt(state.coins, 10) || 0);
    state.gems = Math.max(0, Number.parseInt(state.gems, 10) || 0);
    state.energy = Math.max(0, Number.parseInt(state.energy, 10) || 0);
    state.maxEnergy = Math.max(1, Number.parseInt(state.maxEnergy, 10) || 120);
    state.level = Math.max(1, Number.parseInt(state.level, 10) || 1);
    state.xp = Math.max(0, Number.parseInt(state.xp, 10) || 0);
    state.xpNeeded = Math.max(1, Number.parseInt(state.xpNeeded, 10) || 100);

    if (!Array.isArray(state.plots) || state.plots.length !== MAX_PLOTS) {
        const oldPlots = Array.isArray(state.plots) ? state.plots : [];
        state.plots = Array.from({ length: MAX_PLOTS }, (_, i) => oldPlots[i] || createDefaultPlot(i));
    }
    state.land = normalizeLandMeta(hasLandVersion ? state.land : { unlockedCount: STARTER_LAND_COUNT });
    state.plots = normalizePlotsForLand(state.plots, state.land, { clearLocked: true });
    state.inventory = mergeDeep(getStarterInventory(), state.inventory || {});
    ['seeds', 'crops', 'fertilizers', 'feeds', 'animalProducts'].forEach(category => {
        Object.entries(state.inventory[category] || {}).forEach(([itemId, value]) => {
            state.inventory[category][itemId] = Math.max(0, Number.parseInt(value, 10) || 0);
        });
    });
    if (!state.inventory.buildings) state.inventory.buildings = { feed_mill: 0 };
    state.inventory.buildings.feed_mill = Math.min(1, Math.max(0, Number.parseInt(state.inventory.buildings.feed_mill, 10) || 0));

    if (!state.layout) state.layout = {};
    if (!state.layout.pigPen) state.layout.pigPen = { left: 80, top: 62 };
    if (state.layout.feedMill && typeof state.layout.feedMill !== 'object') state.layout.feedMill = null;

    if (!state.animalProduction || typeof state.animalProduction !== 'object') {
        state.animalProduction = createDefaultAnimalProduction();
    }
    if (!state.animalProduction.animals || typeof state.animalProduction.animals !== 'object') {
        state.animalProduction.animals = {};
    }
    DEFAULT_ANIMAL_IDS.forEach(([id, type]) => {
        const existing = state.animalProduction.animals[id];
        if (!existing || existing.type !== type) {
            state.animalProduction.animals[id] = createAnimalRecord(type);
            return;
        }
        if (!['hungry', 'producing'].includes(existing.status)) {
            existing.status = 'hungry';
        }
        existing.fedAt = existing.status === 'producing' ? existing.fedAt || null : null;
        existing.readyAt = existing.status === 'producing' ? existing.readyAt || null : null;
    });
    if (!state.animalProduction.feedMill || typeof state.animalProduction.feedMill !== 'object') {
        state.animalProduction.feedMill = { activeJob: null };
    }
    if (!hadBuildingInventory && legacyFeedMillJob) {
        state.inventory.buildings.feed_mill = 1;
        state.layout.feedMill = state.layout.feedMill || { left: 54, top: 27 };
    }

    return state;
}

module.exports = {
    createDefaultState,
    normalizeState
};
