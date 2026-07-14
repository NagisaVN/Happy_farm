import { CROP_CONFIGS } from './Seed.js';
import { ANIMAL_PRODUCT_CONFIGS, FEED_CONFIGS, FERTILIZER_CONFIGS, getMarketItemMeta } from './ItemCatalog.js';
import {
    LAND_VERSION,
    MAX_PLOTS,
    STARTER_LAND_COUNT,
    createDefaultPlot,
    getLandPurchasePrice,
    getLandRequiredLevel,
    getNextLandPlotId,
    isPlotUnlocked,
    normalizeLandMeta,
    normalizePlotsForLand
} from './LandConfig.js';

export const FEED_RECIPES = {
    chicken_feed: {
        id: 'chicken_feed',
        outputCategory: 'feeds',
        outputItemId: 'chicken_feed',
        outputQty: 2,
        durationSec: 30,
        ingredients: [
            { category: 'crops', itemId: 'corn', quantity: 1 }
        ]
    },
    cow_feed: {
        id: 'cow_feed',
        outputCategory: 'feeds',
        outputItemId: 'cow_feed',
        outputQty: 2,
        durationSec: 45,
        ingredients: [
            { category: 'crops', itemId: 'corn', quantity: 1 },
            { category: 'crops', itemId: 'carrot', quantity: 1 }
        ]
    },
    pig_feed: {
        id: 'pig_feed',
        outputCategory: 'feeds',
        outputItemId: 'pig_feed',
        outputQty: 2,
        durationSec: 60,
        ingredients: [
            { category: 'crops', itemId: 'carrot', quantity: 2 },
            { category: 'crops', itemId: 'corn', quantity: 1 }
        ]
    }
};

export const ANIMAL_CONFIGS = {
    chicken: {
        type: 'chicken',
        label: 'Gà',
        icon: '🐔',
        feedItemId: 'chicken_feed',
        productItemId: 'egg',
        productionSec: 60
    },
    cow: {
        type: 'cow',
        label: 'Bò',
        icon: '🐄',
        feedItemId: 'cow_feed',
        productItemId: 'milk',
        productionSec: 120
    },
    pig: {
        type: 'pig',
        label: 'Heo',
        icon: '🐖',
        feedItemId: 'pig_feed',
        productItemId: 'bacon',
        productionSec: 180
    }
};

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

export function createDefaultAnimalProduction() {
    return {
        animals: Object.fromEntries(
            DEFAULT_ANIMAL_IDS.map(([id, type]) => [id, createAnimalRecord(type)])
        ),
        feedMill: {
            activeJob: null
        }
    };
}

export const DEFAULT_STATE = {
    farmName: 'Happy Farm',
    coins: 12450,
    gems: 35,
    energy: 120,
    maxEnergy: 120,
    level: 1,
    xp: 0,
    xpNeeded: 100,
    inventory: {
        seeds: { carrot: 10, corn: 0, tomato: 0, pumpkin: 0 },
        crops: { carrot: 0, corn: 0, tomato: 0, pumpkin: 0 },
        fertilizers: { mid: 5, high: 2 },
        feeds: { chicken_feed: 3, cow_feed: 2, pig_feed: 2 },
        animalProducts: { egg: 0, milk: 0, bacon: 0 },
        buildings: { feed_mill: 0 }
    },
    animalProduction: createDefaultAnimalProduction(),
    land: {
        version: LAND_VERSION,
        unlockedCount: STARTER_LAND_COUNT
    },
    plots: Array.from({ length: MAX_PLOTS }, (_, i) => createDefaultPlot(i)),
    quests: [
        { id: 1, title: 'Người gieo mầm', desc: 'Trồng 5 hạt giống Cà rốt', target: 5, current: 0, rewardCoins: 150, rewardXp: 50, claimed: false, action: 'plant', type: 'carrot' },
        { id: 2, title: 'Mùa vụ đầu tiên', desc: 'Thu hoạch 5 Bắp ngô', target: 5, current: 0, rewardCoins: 300, rewardXp: 100, claimed: false, action: 'harvest', type: 'corn' },
        { id: 3, title: 'Nhà buôn nông sản', desc: 'Bán 5 Cà chua trong Cửa hàng', target: 5, current: 0, rewardCoins: 500, rewardXp: 150, claimed: false, action: 'sell', type: 'tomato' }
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
        timePlayed: 0 // seconds
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
        decorations: [
            { id: 'decor-0', left: 10, top: 15, emoji: '🌳', size: '2.8rem' },
            { id: 'decor-1', left: 18, top: 22, emoji: '🌲', size: '2.2rem' },
            { id: 'decor-2', left: 12, top: 78, emoji: '🌳', size: '2.5rem' },
            { id: 'decor-3', left: 22, top: 82, emoji: '🌸', size: '1.8rem' },
            { id: 'decor-4', left: 88, top: 12, emoji: '🌲', size: '2.5rem' },
            { id: 'decor-5', left: 92, top: 20, emoji: '🌳', size: '2.8rem' },
            { id: 'decor-6', left: 85, top: 75, emoji: '🌲', size: '2.4rem' },
            { id: 'decor-7', left: 78, top: 80, emoji: '🌸', size: '1.8rem' },
            { id: 'decor-8', left: 5, top: 45, emoji: '🌳', size: '2.6rem' },
            { id: 'decor-9', left: 94, top: 48, emoji: '🌲', size: '2.2rem' }
        ],
        pavedPaths: []
    }
};

export class Inventory {
    constructor(game) {
        this.game = game;
        this.state = null;
        this.saveTimer = null;
    }

    async loadGame() {
        try {
            const payload = await this.game.api.getState();
            let serverState = payload.state || {};

            const savedData = localStorage.getItem('happy_farm_state');
            if (savedData && !payload.importedLocalSave) {
                const shouldImport = window.confirm('Tìm thấy save cũ trên trình duyệt. Bạn muốn nhập tiến trình này vào tài khoản online không?');
                if (shouldImport) {
                    const imported = await this.game.api.importLocalSave(JSON.parse(savedData));
                    serverState = imported.state || serverState;
                    localStorage.removeItem('happy_farm_state');
                }
            }

            const hasLandVersion = Number(serverState?.land?.version) === LAND_VERSION;
            const legacyFeedMillJob = serverState?.animalProduction?.feedMill?.activeJob;
            const hadBuildingInventory = Boolean(serverState?.inventory?.buildings);
            this.state = this.mergeDeep({}, DEFAULT_STATE, serverState);
            this.game.currentUser = payload.profile || this.game.api.profile;
            this.game.importedLocalSave = Boolean(payload.importedLocalSave);

            // Migrate older saves to include farmName and signpost layout coordinate
            if (this.state) {
                if (!this.state.farmName) {
                    this.state.farmName = 'Happy Farm';
                }
                if (!this.state.layout) {
                    this.state.layout = {};
                }
                if (!this.state.layout.signpost) {
                    this.state.layout.signpost = { left: 36, top: 12 };
                }
                if (!this.state.layout.chickenCoop) {
                    this.state.layout.chickenCoop = { left: 10, top: 56 };
                }
                if (!this.state.layout.cowPen) {
                    this.state.layout.cowPen = { left: 70, top: 18 };
                }
                if (!this.state.layout.pigPen) {
                    this.state.layout.pigPen = { left: 80, top: 62 };
                }
                if (!this.state.pavedPaths) {
                    this.state.pavedPaths = [];
                }
                if (!this.state.inventory) {
                    this.state.inventory = {};
                }
                if (!this.state.inventory.fertilizers) {
                    this.state.inventory.fertilizers = { mid: 5, high: 2 };
                }
                if (!this.state.inventory.feeds) {
                    this.state.inventory.feeds = { chicken_feed: 3, cow_feed: 2, pig_feed: 2 };
                }
                if (!this.state.inventory.animalProducts) {
                    this.state.inventory.animalProducts = { egg: 0, milk: 0, bacon: 0 };
                }
                if (!this.state.inventory.buildings) {
                    this.state.inventory.buildings = { feed_mill: 0 };
                }
                if (!hadBuildingInventory && legacyFeedMillJob) {
                    this.state.inventory.buildings.feed_mill = 1;
                    this.state.layout.feedMill = this.state.layout.feedMill || { left: 54, top: 27 };
                }
            }

            // Migrate plots array if length is not the supported farm size
            if (this.state && this.state.plots && this.state.plots.length !== MAX_PLOTS) {
                const oldPlots = this.state.plots;
                this.state.plots = Array.from({ length: MAX_PLOTS }, (_, i) => {
                    if (oldPlots[i]) {
                        oldPlots[i].id = i;
                        return oldPlots[i];
                    }
                    return createDefaultPlot(i);
                });
            }
            if (this.state) {
                this.migrateLandState(hasLandVersion);
                this.normalizeAnimalProduction();
            }

            // Fix stuck digging states
            if (this.state && this.state.plots) {
                this.state.plots.forEach(p => {
                    if (p.state === 'digging') {
                        p.state = 'empty';
                        p.cropType = null;
                        p.plantTime = null;
                        p.growthDuration = 0;
                    }
                });
            }

        } catch (e) {
            console.error('Error loading game state:', e);
            throw e;
        }
    }

    saveGame() {
        if (this.game?.isVisitingFarm) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.flushSave();
        }, 250);
    }

    async flushSave() {
        if (this.game?.isVisitingFarm) return;
        if (!this.state || !this.game.api?.hasToken()) return;
        try {
            await this.game.api.saveState(this.state);
        } catch (e) {
            console.error('Error saving game state:', e);
            if (this.game?.showToast) {
                this.game.showToast('Không lưu được dữ liệu online. Kiểm tra kết nối/server.');
            }
        }
    }

    resetGame() {
        this.game.showCustomConfirm(
            '⚠️ RESET NÔNG TRẠI',
            'Bạn có chắc chắn muốn RESET toàn bộ dữ liệu nông trại? Hành động này không thể hoàn tác!'
        ).then(confirmed => {
            if (confirmed) {
                localStorage.removeItem('happy_farm_state');
                this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
                this.saveGame();
                window.location.reload();
            }
        });
    }

    mergeDeep(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        return this.mergeDeep(target, ...sources);
    }

    isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    migrateLandState(hasLandVersion) {
        this.state.land = normalizeLandMeta(
            hasLandVersion ? this.state.land : { unlockedCount: STARTER_LAND_COUNT }
        );
        this.state.plots = normalizePlotsForLand(this.state.plots, this.state.land, { clearLocked: true });
    }

    ensureInventoryBucket(category, defaults) {
        if (!this.state.inventory) this.state.inventory = {};
        if (!this.state.inventory[category]) this.state.inventory[category] = {};
        Object.entries(defaults).forEach(([itemId, fallback]) => {
            const current = this.state.inventory[category][itemId];
            if (current === undefined || current === null || Number.isNaN(Number(current))) {
                this.state.inventory[category][itemId] = fallback;
            } else {
                this.state.inventory[category][itemId] = Math.max(0, Number.parseInt(current, 10) || 0);
            }
        });
    }

    normalizeAnimalProduction() {
        if (!this.state.inventory) this.state.inventory = {};
        this.ensureInventoryBucket('feeds', { chicken_feed: 3, cow_feed: 2, pig_feed: 2 });
        this.ensureInventoryBucket('animalProducts', { egg: 0, milk: 0, bacon: 0 });
        this.ensureInventoryBucket('buildings', { feed_mill: 0 });
        this.state.inventory.buildings.feed_mill = Math.min(1, this.getInventoryAmount('buildings', 'feed_mill'));

        if (!this.state.animalProduction || typeof this.state.animalProduction !== 'object') {
            this.state.animalProduction = createDefaultAnimalProduction();
        }
        if (!this.state.animalProduction.animals || typeof this.state.animalProduction.animals !== 'object') {
            this.state.animalProduction.animals = {};
        }
        DEFAULT_ANIMAL_IDS.forEach(([id, type]) => {
            const existing = this.state.animalProduction.animals[id];
            if (!existing || existing.type !== type) {
                this.state.animalProduction.animals[id] = createAnimalRecord(type);
                return;
            }
            if (!['hungry', 'producing'].includes(existing.status)) {
                existing.status = 'hungry';
            }
            existing.fedAt = existing.status === 'producing' ? existing.fedAt || null : null;
            existing.readyAt = existing.status === 'producing' ? existing.readyAt || null : null;
        });

        if (!this.state.animalProduction.feedMill || typeof this.state.animalProduction.feedMill !== 'object') {
            this.state.animalProduction.feedMill = { activeJob: null };
        }
        const job = this.state.animalProduction.feedMill.activeJob;
        if (job && !FEED_RECIPES[job.recipeId]) {
            this.state.animalProduction.feedMill.activeJob = null;
        }
    }

    getInventoryAmount(category, itemId) {
        return Math.max(0, Number.parseInt(this.state?.inventory?.[category]?.[itemId], 10) || 0);
    }

    addInventoryAmount(category, itemId, quantity) {
        if (!this.state.inventory[category]) this.state.inventory[category] = {};
        this.state.inventory[category][itemId] =
            this.getInventoryAmount(category, itemId) + Math.max(0, Number.parseInt(quantity, 10) || 0);
    }

    deductInventoryAmount(category, itemId, quantity) {
        const amount = Math.max(0, Number.parseInt(quantity, 10) || 0);
        const current = this.getInventoryAmount(category, itemId);
        if (current < amount) return false;
        if (!this.state.inventory[category]) this.state.inventory[category] = {};
        this.state.inventory[category][itemId] = current - amount;
        return true;
    }

    getFeedRecipeStatus(recipeId) {
        const recipe = FEED_RECIPES[recipeId];
        if (!recipe) {
            return { ok: false, reason: 'Không tìm thấy công thức.' };
        }
        const ingredients = recipe.ingredients.map(item => {
            const owned = this.getInventoryAmount(item.category, item.itemId);
            return {
                ...item,
                owned,
                ok: owned >= item.quantity,
                meta: getMarketItemMeta(item.category, item.itemId)
            };
        });
        const job = this.getFeedMillJobInfo();
        if (job.hasJob) {
            return { ok: false, reason: 'Máy trộn đang bận.', recipe, ingredients, job };
        }
        if (ingredients.some(item => !item.ok)) {
            return { ok: false, reason: 'Thiếu nguyên liệu.', recipe, ingredients, job };
        }
        return { ok: true, recipe, ingredients, job };
    }

    getFeedMillJobInfo(now = Date.now()) {
        this.normalizeAnimalProduction();
        const job = this.state.animalProduction.feedMill.activeJob;
        if (!job) {
            return { hasJob: false, ready: false, remainingMs: 0 };
        }
        const recipe = FEED_RECIPES[job.recipeId];
        const readyAtMs = new Date(job.readyAt).getTime();
        const remainingMs = Math.max(0, readyAtMs - now);
        return {
            hasJob: true,
            ready: remainingMs === 0,
            remainingMs,
            job,
            recipe,
            outputMeta: getMarketItemMeta(recipe.outputCategory, recipe.outputItemId)
        };
    }

    startFeedRecipe(recipeId) {
        if (this.game?.isVisitingFarm) return false;
        if (!this.game?.canUseFeedMill?.()) {
            this.game?.showToast('Hãy mua và đặt Máy trộn trong chế độ Thiết kế trước.');
            return false;
        }
        this.normalizeAnimalProduction();
        const status = this.getFeedRecipeStatus(recipeId);
        if (!status.ok) {
            this.game.showToast(status.reason);
            return false;
        }

        status.recipe.ingredients.forEach(item => {
            this.deductInventoryAmount(item.category, item.itemId, item.quantity);
        });

        const now = Date.now();
        this.state.animalProduction.feedMill.activeJob = {
            recipeId,
            startedAt: new Date(now).toISOString(),
            readyAt: new Date(now + status.recipe.durationSec * 1000).toISOString()
        };

        this.game.playSFX('click');
        this.game.showToast(`Máy trộn bắt đầu làm ${status.recipe.outputQty} ${getMarketItemMeta(status.recipe.outputCategory, status.recipe.outputItemId).name}.`);
        this.game.renderShop();
        this.game.renderInventory?.();
        this.saveGame();
        return true;
    }

    collectFeedMillJob() {
        if (this.game?.isVisitingFarm) return false;
        if (!this.game?.canUseFeedMill?.()) {
            this.game?.showToast('Máy trộn chưa được đặt trên nông trại.');
            return false;
        }
        this.normalizeAnimalProduction();
        const jobInfo = this.getFeedMillJobInfo();
        if (!jobInfo.hasJob) return false;
        if (!jobInfo.ready) {
            this.game.showToast('Thức ăn vẫn đang được trộn.');
            return false;
        }

        const recipe = jobInfo.recipe;
        this.addInventoryAmount(recipe.outputCategory, recipe.outputItemId, recipe.outputQty);
        this.state.animalProduction.feedMill.activeJob = null;

        this.game.playSFX('harvest');
        this.game.showToast(`Đã thu x${recipe.outputQty} ${jobInfo.outputMeta.name}.`);
        this.game.renderShop();
        this.game.renderInventory?.();
        this.saveGame();
        return true;
    }

    getAnimalStatusInfo(animalId, now = Date.now()) {
        this.normalizeAnimalProduction();
        const animal = this.state.animalProduction.animals[animalId];
        if (!animal) return null;
        const config = ANIMAL_CONFIGS[animal.type];
        const readyAtMs = animal.readyAt ? new Date(animal.readyAt).getTime() : 0;
        const remainingMs = animal.status === 'producing' ? Math.max(0, readyAtMs - now) : 0;
        const status = animal.status === 'producing' && remainingMs === 0 ? 'ready' : animal.status;
        return {
            id: animalId,
            ...animal,
            config,
            status,
            remainingMs,
            feedCount: this.getInventoryAmount('feeds', config.feedItemId),
            productMeta: getMarketItemMeta('animalProducts', config.productItemId),
            feedMeta: getMarketItemMeta('feeds', config.feedItemId)
        };
    }

    getAnimalsByType(type) {
        this.normalizeAnimalProduction();
        return Object.keys(this.state.animalProduction.animals)
            .filter(id => this.state.animalProduction.animals[id].type === type)
            .map(id => this.getAnimalStatusInfo(id));
    }

    chooseAnimalForType(type) {
        const animals = this.getAnimalsByType(type);
        return animals.find(animal => animal.status === 'ready')
            || animals.find(animal => animal.status === 'hungry')
            || animals[0]
            || null;
    }

    handleAnimalAction(animalId) {
        const info = this.getAnimalStatusInfo(animalId);
        if (!info) return false;
        if (info.status === 'ready') {
            return this.collectAnimalProduct(animalId);
        }
        if (info.status === 'hungry') {
            return this.feedAnimal(animalId);
        }
        this.game.showToast(`${info.config.label} đang sản xuất, còn ${this.game.formatDurationMs?.(info.remainingMs) || Math.ceil(info.remainingMs / 1000) + 's'}.`);
        return false;
    }

    feedAnimal(animalId) {
        if (this.game?.isVisitingFarm) return false;
        const info = this.getAnimalStatusInfo(animalId);
        if (!info || info.status !== 'hungry') return false;
        if (info.feedCount <= 0) {
            this.game.showToast(`Không đủ ${info.feedMeta.name}. Hãy trộn thêm trong Shop.`);
            return false;
        }

        this.deductInventoryAmount('feeds', info.config.feedItemId, 1);
        const now = Date.now();
        const animal = this.state.animalProduction.animals[animalId];
        animal.status = 'producing';
        animal.fedAt = new Date(now).toISOString();
        animal.readyAt = new Date(now + info.config.productionSec * 1000).toISOString();

        this.game.playSFX('plant');
        this.game.showToast(`Đã cho ${info.config.label} ăn. Sẽ có ${info.productMeta.name} sau ${info.config.productionSec}s.`);
        this.game.phaserWorld?.syncAnimals();
        this.game.renderShop?.();
        this.game.renderInventory?.();
        this.saveGame();
        return true;
    }

    collectAnimalProduct(animalId) {
        if (this.game?.isVisitingFarm) return false;
        const info = this.getAnimalStatusInfo(animalId);
        if (!info || info.status !== 'ready') return false;

        this.addInventoryAmount('animalProducts', info.config.productItemId, 1);
        const animal = this.state.animalProduction.animals[animalId];
        animal.status = 'hungry';
        animal.fedAt = null;
        animal.readyAt = null;

        this.game.playSFX('harvest');
        this.game.showToast(`Đã thu x1 ${info.productMeta.name}.`);
        this.game.phaserWorld?.syncAnimals();
        this.game.renderShop?.();
        this.game.renderInventory?.();
        this.game.updateQuestBadge?.();
        this.saveGame();
        return true;
    }

    isPlotUnlocked(plotId) {
        return isPlotUnlocked(this.state?.land, plotId);
    }

    getNextLandPlotId() {
        return getNextLandPlotId(this.state?.land);
    }

    getLandPurchasePrice() {
        return getLandPurchasePrice(this.state?.land);
    }

    getLandRequiredLevel() {
        return getLandRequiredLevel(this.state?.land);
    }

    buyLand(currency) {
        if (this.game?.systemSettings?.ENABLE_EXPANSION === false) {
            this.game.showToast('Chức năng mở rộng đất đang tạm tắt.');
            return false;
        }
        const nextPlotId = this.getNextLandPlotId();
        const price = this.getLandPurchasePrice();
        const requiredLevel = this.getLandRequiredLevel();

        if (nextPlotId === null || !price) {
            this.game.showToast('Bạn đã mở hết toàn bộ ruộng đất!');
            return false;
        }

        if (this.state.level < requiredLevel) {
            this.game.showToast(`Cần đạt cấp ${requiredLevel} để mở rộng ô đất này!`);
            return false;
        }

        if (currency === 'gold') {
            if (this.state.coins < price.gold) {
                this.game.showToast('Không đủ vàng để mua ô đất này!');
                return false;
            }
            this.state.coins -= price.gold;
            this.state.stats.coinsSpentTotal += price.gold;
        } else if (currency === 'gems') {
            if (this.state.gems < price.gems) {
                this.game.showToast('Không đủ kim cương để mua ô đất này!');
                return false;
            }
            this.state.gems -= price.gems;
        } else {
            return false;
        }

        this.state.land.unlockedCount += 1;
        this.state.land = normalizeLandMeta(this.state.land);

        this.game.playSFX('levelUp');
        this.game.renderHUD();
        this.game.phaserWorld?.syncAll();
        this.game.updateHarvestAllBadge();
        this.game.showToast(`Đã mở thêm ô đất #${nextPlotId + 1}!`);
        this.saveGame();
        return true;
    }

    addXp(amount) {
        this.state.xp += amount;
        if (this.state.xp >= this.state.xpNeeded) {
            this.state.xp -= this.state.xpNeeded;
            this.state.level++;
            this.state.xpNeeded = Math.floor(this.state.xpNeeded * 1.25);
            this.game.playSFX('levelUp');
            
            // Create level up particles
            const local = this.game.getLocalCoords(window.innerWidth / 2, window.innerHeight / 3);
            this.game.createParticles(local.x, local.y, 50, 'spark');

            this.game.showToast(`✨ CHÚC MỪNG! Bạn đã lên Cấp ${this.state.level}! ✨`);
        }
        this.game.renderHUD();
    }

    getInventoryTotal() {
        return Object.values(this.state.inventory || {}).reduce((total, category) => total + Object.values(category || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0), 0);
    }

    canBuyFromSystemShop(qty) {
        const amount = Math.max(1, Number.parseInt(qty, 10) || 1);
        const maxStorage = Number(this.game?.systemSettings?.MAX_STORAGE || 999999);
        if (this.getInventoryTotal() + amount > maxStorage) {
            this.game.showToast(`Kho chỉ chứa tối đa ${maxStorage.toLocaleString('vi-VN')} vật phẩm.`);
            return false;
        }
        const dailyLimit = Number(this.game?.systemSettings?.MAX_ITEM_PER_DAY || 0);
        if (dailyLimit <= 0) return true;
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Saigon' });
        if (this.state.shopPurchaseDay !== today) {
            this.state.shopPurchaseDay = today;
            this.state.shopPurchaseCount = 0;
        }
        if (Number(this.state.shopPurchaseCount || 0) + amount > dailyLimit) {
            this.game.showToast(`Mỗi ngày chỉ được mua tối đa ${dailyLimit} vật phẩm.`);
            return false;
        }
        return true;
    }

    recordSystemShopPurchase(qty) {
        this.state.shopPurchaseCount = Number(this.state.shopPurchaseCount || 0) + Math.max(1, Number.parseInt(qty, 10) || 1);
    }

    async buySeed(seedType, qty = 1) {
        qty = parseInt(qty) || 1;
        if (qty < 1) qty = 1;
        const crop = CROP_CONFIGS[seedType];
        if (!crop) return;
        if (crop.shopProductId && this.game?.api) {
            try {
                const payload = await this.game.api.buyShopProduct(crop.shopProductId, qty);
                this.game.applyServerState(payload.state);
                this.game.playSFX('click');
                this.game.showToast(`Đã mua ${qty} Hạt giống ${crop.nameVi}!`);
                await this.game.renderShop();
            } catch (error) { this.game.showToast(error.message || 'Không mua được sản phẩm.'); }
            return;
        }
        if (!this.canBuyFromSystemShop(qty)) return;
        const requiredLevel = Number(crop.requiredLevel) || 1;
        if (this.state.level < requiredLevel) {
            this.game.showToast(`Cần đạt cấp ${requiredLevel} để mua hạt giống ${crop.nameVi}!`);
            return;
        }
        const totalCost = crop.seedCost * qty;
        
        if (this.state.coins >= totalCost) {
            this.state.coins -= totalCost;
            this.state.inventory.seeds[seedType] = (this.state.inventory.seeds[seedType] || 0) + qty;
            this.state.stats.coinsSpentTotal += totalCost;
            this.recordSystemShopPurchase(qty);
            
            this.game.playSFX('click');
            this.game.showToast(`Đã mua ${qty} Hạt giống ${crop.nameVi}!`);
            
            this.game.renderShop();
            this.game.renderHUD();
            this.saveGame();
        }
    }

    async buyFertilizer(type, qty = 1) {
        qty = parseInt(qty) || 1;
        if (qty < 1) qty = 1;
        const fertilizer = FERTILIZER_CONFIGS[type];
        if (!fertilizer || !this.canBuyFromSystemShop(qty)) return;
        if (fertilizer.shopProductId && this.game?.api) {
            try {
                const payload = await this.game.api.buyShopProduct(fertilizer.shopProductId, qty);
                this.game.applyServerState(payload.state);
                this.game.playSFX('click');
                this.game.showToast(`Đã mua ${qty} ${fertilizer.nameVi}!`);
                await this.game.renderShop();
            } catch (error) { this.game.showToast(error.message || 'Không mua được sản phẩm.'); }
            return;
        }
        const price = Number(fertilizer.basePrice);
        const nameVi = fertilizer.nameVi;
        const totalCost = price * qty;

        if (this.state.coins >= totalCost) {
            this.state.coins -= totalCost;
            if (!this.state.inventory.fertilizers) {
                this.state.inventory.fertilizers = { mid: 0, high: 0 };
            }
            this.state.inventory.fertilizers[type] = (this.state.inventory.fertilizers[type] || 0) + qty;
            this.state.stats.coinsSpentTotal += totalCost;
            this.recordSystemShopPurchase(qty);

            this.game.playSFX('click');
            this.game.showToast(`Đã mua ${qty} ${nameVi}!`);

            this.game.renderShop();
            this.game.renderHUD();
            this.saveGame();
        } else {
            this.game.showToast('Không đủ tiền vàng!');
        }
    }

    async buyFeedMill() {
        this.normalizeAnimalProduction();
        if (this.getInventoryAmount('buildings', 'feed_mill') > 0) {
            this.game.showToast('Bạn đã sở hữu Máy trộn.');
            return false;
        }
        const config = this.game?.buildingConfigs?.feed_mill;
        const price = Number(config?.basePrice || 2000);
        if (config?.shopProductId && this.game?.api) {
            try {
                const payload = await this.game.api.buyShopProduct(config.shopProductId, 1);
                this.game.applyServerState(payload.state);
                this.game.playSFX('click');
                this.game.showToast('Đã mua Máy trộn! Vào Thiết kế để đặt máy.');
                await this.game.renderShop();
                return true;
            } catch (error) {
                this.game.showToast(error.message || 'Không mua được Máy trộn.');
                return false;
            }
        }
        if (!this.canBuyFromSystemShop(1)) return false;
        if (this.state.coins < price) {
            this.game.showToast('Không đủ tiền vàng!');
            return false;
        }
        this.state.coins -= price;
        this.state.stats.coinsSpentTotal += price;
        this.state.inventory.buildings.feed_mill = 1;
        this.recordSystemShopPurchase(1);
        this.game.playSFX('click');
        this.game.showToast('Đã mua Máy trộn! Vào Thiết kế để đặt máy.');
        this.game.renderHUD();
        this.game.renderShop();
        this.game.applyLayout?.();
        this.saveGame();
        return true;
    }

    sellCrops(cropType) {
        const crop = CROP_CONFIGS[cropType];
        const count = this.state.inventory.crops[cropType] || 0;
        
        if (count > 0) {
            const earn = count * crop.cropValue;
            this.state.coins += earn;
            this.state.inventory.crops[cropType] = 0;
            this.state.stats.coinsEarnedTotal += earn;
            
            this.game.playSFX('harvest');
            this.game.showToast(`Đã bán x${count} ${crop.nameVi} thu về 🪙 ${earn} Vàng!`);

            this.updateQuestProgress('sell', cropType, count);
            this.checkAchievements();

            this.game.renderShop();
            this.game.renderHUD();
            this.saveGame();
        }
    }

    claimQuest(questId) {
        const q = this.state.quests.find(x => x.id === questId);
        if (q && q.current >= q.target && !q.claimed) {
            q.claimed = true;
            this.state.coins += q.rewardCoins;
            this.state.stats.coinsEarnedTotal += q.rewardCoins;
            this.addXp(q.rewardXp);
            
            this.game.playSFX('quest');
            this.game.showToast(`Đã hoàn thành nhiệm vụ "${q.title}"! Nhận 🪙 ${q.rewardCoins} Vàng.`);
            
            this.game.renderQuests();
            this.game.updateQuestBadge();
            this.game.renderHUD();
            this.saveGame();
        }
    }

    updateQuestProgress(action, type, amount) {
        let changed = false;
        this.state.quests.forEach(q => {
            if (!q.claimed && q.action === action && q.type === type) {
                q.current = Math.min(q.target, q.current + amount);
                changed = true;
            }
        });
        if (changed) {
            this.game.updateQuestBadge();
        }
    }

    checkAchievements() {
        let saveNeeded = false;
        this.state.achievements.forEach(a => {
            const currentVal = this.state.stats[a.key] || 0;
            if (currentVal >= a.target && !a.unlocked) {
                a.unlocked = true;
                this.state.gems += a.rewardGems;
                saveNeeded = true;
                setTimeout(() => {
                    this.game.playSFX('levelUp');
                    this.game.showToast(`🏆 Thành Tích: "${a.title}" hoàn thành! (+💎 ${a.rewardGems})`);
                    this.game.renderHUD();
                }, 500);
            }
        });
        if (saveNeeded) this.saveGame();
    }

    unlockCat() {
        const cost = this.state.pets.cat.cost;
        if (this.state.gems >= cost) {
            this.state.gems -= cost;
            this.state.pets.cat.unlocked = true;
            this.state.pets.cat.active = true;
            
            this.game.playSFX('levelUp');
            this.game.showToast('Chúc mừng! Đã mở khóa Mèo Tam Thể (+10% Tốc độ hồi năng lượng).');
            
            this.game.renderPets();
            this.game.renderHUD();
            this.saveGame();
        }
    }
}
