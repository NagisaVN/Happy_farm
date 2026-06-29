const { getStarterInventory } = require('./itemCatalog');

function createDefaultState(farmName = 'Happy Farm') {
    return {
        farmName,
        coins: 12450,
        gems: 35,
        energy: 120,
        maxEnergy: 120,
        level: 15,
        xp: 1250,
        xpNeeded: 2000,
        inventory: getStarterInventory(),
        plots: Array.from({ length: 28 }, (_, i) => ({
            id: i,
            state: 'empty',
            cropType: null,
            plantTime: null,
            growthDuration: 0
        })),
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
            coinsEarnedTotal: 12450,
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
    const state = mergeDeep(createDefaultState(farmName), input || {});
    state.farmName = String(state.farmName || farmName || 'Happy Farm').slice(0, 64);
    state.coins = Math.max(0, Number.parseInt(state.coins, 10) || 0);
    state.gems = Math.max(0, Number.parseInt(state.gems, 10) || 0);
    state.energy = Math.max(0, Number.parseInt(state.energy, 10) || 0);
    state.maxEnergy = Math.max(1, Number.parseInt(state.maxEnergy, 10) || 120);
    state.level = Math.max(1, Number.parseInt(state.level, 10) || 1);
    state.xp = Math.max(0, Number.parseInt(state.xp, 10) || 0);
    state.xpNeeded = Math.max(1, Number.parseInt(state.xpNeeded, 10) || 100);

    if (!Array.isArray(state.plots) || state.plots.length !== 28) {
        const oldPlots = Array.isArray(state.plots) ? state.plots : [];
        state.plots = Array.from({ length: 28 }, (_, i) => oldPlots[i] || createDefaultState().plots[i]);
    }

    return state;
}

module.exports = {
    createDefaultState,
    normalizeState
};
