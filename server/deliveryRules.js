const SAIGON_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ORDER_SLOT_COUNT = 6;
const TRASH_COOLDOWN_MS = 60 * 1000;

const CROP_META = {
    carrot: { itemId: 'carrot', cropValue: 38, xpReward: 5, minQty: 3, maxQty: 8, requiredLevel: 1 },
    corn: { itemId: 'corn', cropValue: 83, xpReward: 12, minQty: 2, maxQty: 6, requiredLevel: 2 },
    tomato: { itemId: 'tomato', cropValue: 165, xpReward: 25, minQty: 2, maxQty: 5, requiredLevel: 4 },
    pumpkin: { itemId: 'pumpkin', cropValue: 360, xpReward: 55, minQty: 1, maxQty: 3, requiredLevel: 6 }
};

const CROP_IDS = Object.keys(CROP_META);

function getOrderSlotCount() {
    const { getSettingValue } = require('./systemSettingsStore');
    return Math.max(1, Math.min(20, Number.parseInt(getSettingValue('MAX_DAILY_MISSION', ORDER_SLOT_COUNT), 10) || ORDER_SLOT_COUNT));
}

function applyDeliveryConfig(grouped = {}) {
    const seeds = Object.fromEntries((grouped.seed || []).map(item => [item.code, item]));
    (grouped.crop || []).forEach(item => {
        if (!CROP_META[item.code]) return;
        Object.assign(CROP_META[item.code], {
            cropValue: Number(item.sellPrice || CROP_META[item.code].cropValue),
            xpReward: Number(item.xpReward || CROP_META[item.code].xpReward),
            requiredLevel: Number(seeds[item.code]?.unlockLevel || item.unlockLevel || CROP_META[item.code].requiredLevel)
        });
    });
}

const WEEKLY_MILESTONES = [
    { id: '100', threshold: 100, reward: { coins: 300, xp: 50 } },
    { id: '300', threshold: 300, reward: { fertilizers: { mid: 1 }, xp: 100 } },
    { id: '600', threshold: 600, reward: { gems: 5, xp: 250 } }
];

function pad2(value) {
    return String(value).padStart(2, '0');
}

function formatLocalDate(localMs) {
    const local = new Date(localMs);
    return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
}

function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}

function getWeekInfo(value = new Date()) {
    const now = toDate(value);
    const local = new Date(now.getTime() + SAIGON_OFFSET_MS);
    const { getSettingValue } = require('./systemSettingsStore');
    const resetDayIso = Math.max(1, Math.min(7, Number.parseInt(getSettingValue('LEADERBOARD_RESET_DAY', 1), 10) || 1));
    const currentDayIso = local.getUTCDay() === 0 ? 7 : local.getUTCDay();
    const daysSinceMonday = (currentDayIso - resetDayIso + 7) % 7;
    const startLocalMs = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate() - daysSinceMonday
    );
    const startUtcMs = startLocalMs - SAIGON_OFFSET_MS;

    return {
        weekId: formatLocalDate(startLocalMs),
        startsAt: new Date(startUtcMs).toISOString(),
        endsAt: new Date(startUtcMs + (7 * DAY_MS)).toISOString()
    };
}

function getPreviousWeekInfo(value = new Date()) {
    return getWeekInfo(new Date(toDate(value).getTime() - (7 * DAY_MS)));
}

function hashString(input) {
    let hash = 2166136261;
    const text = String(input);
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    return function next() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function randomInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
}

function generateOrder({ userId, weekId, slotIndex, entropy = '', level = 1 }) {
    const seed = hashString(`${userId}:${weekId}:${slotIndex}:${entropy}`);
    const rng = mulberry32(seed);
    const desiredItemCount = rng() < 0.35 ? 2 : 1;
    const playerLevel = Math.max(1, Number.parseInt(level, 10) || 1);
    const available = CROP_IDS.filter(itemId => CROP_META[itemId].requiredLevel <= playerLevel);
    const itemCount = Math.min(desiredItemCount, available.length);
    const items = [];

    for (let i = 0; i < itemCount; i += 1) {
        const cropIndex = randomInt(rng, 0, available.length - 1);
        const itemId = available.splice(cropIndex, 1)[0];
        const meta = CROP_META[itemId];
        const slotDifficulty = Math.floor(Number(slotIndex) / 2);
        const quantity = Math.min(meta.maxQty + slotDifficulty, randomInt(rng, meta.minQty, meta.maxQty) + slotDifficulty);
        items.push({ category: 'crops', itemId, quantity });
    }

    const cropValueTotal = items.reduce((total, item) => {
        return total + (CROP_META[item.itemId].cropValue * item.quantity);
    }, 0);
    const xpBase = items.reduce((total, item) => {
        return total + (CROP_META[item.itemId].xpReward * item.quantity);
    }, 0);

    const rewardCoins = Math.ceil((cropValueTotal * 1.35) + (items.length * 25));
    const rewardXp = Math.ceil((xpBase * 1.2) + 10);
    const weeklyPoints = Math.max(10, Math.round((cropValueTotal / 18) + (rewardXp / 2)));

    return {
        items,
        rewardCoins,
        rewardXp,
        weeklyPoints
    };
}

function addXpToState(state, amount) {
    let xpToAdd = Math.max(0, Number.parseInt(amount, 10) || 0);
    state.xp = Math.max(0, Number.parseInt(state.xp, 10) || 0);
    state.level = Math.max(1, Number.parseInt(state.level, 10) || 1);
    state.xpNeeded = Math.max(1, Number.parseInt(state.xpNeeded, 10) || 100);

    state.xp += xpToAdd;
    while (state.xp >= state.xpNeeded) {
        state.xp -= state.xpNeeded;
        state.level += 1;
        state.xpNeeded = Math.floor(state.xpNeeded * 1.25);
    }
}

function applyRewardToState(state, reward = {}) {
    if (!state.inventory) state.inventory = {};
    if (!state.inventory.fertilizers) state.inventory.fertilizers = { mid: 0, high: 0 };
    if (!state.stats) state.stats = {};

    const coins = Math.max(0, Number.parseInt(reward.coins, 10) || 0);
    const gems = Math.max(0, Number.parseInt(reward.gems, 10) || 0);

    if (coins > 0) {
        state.coins = (Number.parseInt(state.coins, 10) || 0) + coins;
        state.stats.coinsEarnedTotal = (Number.parseInt(state.stats.coinsEarnedTotal, 10) || 0) + coins;
    }
    if (gems > 0) {
        state.gems = (Number.parseInt(state.gems, 10) || 0) + gems;
    }
    if (reward.fertilizers) {
        Object.entries(reward.fertilizers).forEach(([type, rawAmount]) => {
            const amount = Math.max(0, Number.parseInt(rawAmount, 10) || 0);
            state.inventory.fertilizers[type] = (Number.parseInt(state.inventory.fertilizers[type], 10) || 0) + amount;
        });
    }
    if (reward.xp) {
        addXpToState(state, reward.xp);
    }
}

function getRankReward(rank) {
    const numericRank = Number.parseInt(rank, 10) || 0;
    if (numericRank === 1) {
        return { id: 'rank-1', label: 'Top 1', reward: { gems: 15, coins: 1500, xp: 500 } };
    }
    if (numericRank >= 2 && numericRank <= 3) {
        return { id: 'rank-2-3', label: 'Top 2-3', reward: { gems: 10, coins: 1000, xp: 300 } };
    }
    if (numericRank >= 4 && numericRank <= 10) {
        return { id: 'rank-4-10', label: 'Top 4-10', reward: { gems: 5, coins: 600, xp: 150 } };
    }
    return null;
}

function decorateMilestones(points, claimedIds = []) {
    const claimed = new Set(claimedIds.map(String));
    const currentPoints = Math.max(0, Number.parseInt(points, 10) || 0);
    return WEEKLY_MILESTONES.map(milestone => ({
        ...milestone,
        claimed: claimed.has(milestone.id),
        claimable: currentPoints >= milestone.threshold && !claimed.has(milestone.id)
    }));
}

function getCooldownRemainingMs(cooldownUntil, value = new Date()) {
    if (!cooldownUntil) return 0;
    return Math.max(0, toDate(cooldownUntil).getTime() - toDate(value).getTime());
}

module.exports = {
    applyDeliveryConfig,
    ORDER_SLOT_COUNT,
    getOrderSlotCount,
    TRASH_COOLDOWN_MS,
    CROP_META,
    WEEKLY_MILESTONES,
    getWeekInfo,
    getPreviousWeekInfo,
    generateOrder,
    addXpToState,
    applyRewardToState,
    getRankReward,
    decorateMilestones,
    getCooldownRemainingMs
};
