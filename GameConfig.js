import { CROP_CONFIGS } from './Seed.js';
import { ANIMAL_CONFIGS, FEED_RECIPES } from './Inventory.js';
import { ANIMAL_PRODUCT_CONFIGS, BUILDING_CONFIGS, FEED_CONFIGS, FERTILIZER_CONFIGS } from './ItemCatalog.js';

export const SYSTEM_SETTINGS = {
    BUY_RATE: 1, SELL_RATE: 1, ENABLE_DISCOUNT: true, ENABLE_AUTO_HARVEST: true,
    ENABLE_DELIVERY: true, ENABLE_ANIMAL: true, ENABLE_EXPANSION: true, ENABLE_EVENT: true,
    EVENT_BANNER: '', EVENT_POPUP: false, SHOP_REFRESH_TIME: 0, MAX_ITEM_PER_DAY: 0,
    MAX_STORAGE: 999999, PASSWORD_MIN_LENGTH: 6
};

function byCode(items = []) { return Object.fromEntries(items.map(item => [item.code, item])); }

export function applyGameConfig(payload = {}) {
    const grouped = payload.grouped || {};
    Object.assign(SYSTEM_SETTINGS, payload.settings || {});
    SYSTEM_SETTINGS.ACTIVE_EVENTS = Array.isArray(payload.events) ? payload.events : [];
    const crops = byCode(grouped.crop);
    const seeds = byCode(grouped.seed);
    const seedShop = byCode(grouped.shop).seed_store;
    const discountFactor = SYSTEM_SETTINGS.ENABLE_DISCOUNT === false ? 1 : Math.max(0, 1 - (Number(seedShop?.config?.discountPercent || 0) / 100));
    const buyRate = Math.max(0, Number(SYSTEM_SETTINGS.BUY_RATE ?? 1));
    const sellRate = Math.max(0, Number(SYSTEM_SETTINGS.SELL_RATE ?? 1));
    Object.entries(crops).forEach(([code, item]) => {
        if (!CROP_CONFIGS[code]) return;
        const seed = seeds[code] || item;
        Object.assign(CROP_CONFIGS[code], {
            nameVi: item.name,
            icon: item.config?.icon || CROP_CONFIGS[code].icon,
            growthTime: Number(item.growthSeconds || seed.growthSeconds || CROP_CONFIGS[code].growthTime),
            requiredLevel: Number(seed.unlockLevel || item.unlockLevel || 1),
            seedCost: Math.round(Number(seed.buyPrice || item.buyPrice || 0) * discountFactor * buyRate),
            cropValue: Math.round(Number(item.sellPrice || 0) * sellRate),
            xpReward: Number(item.xpReward || 0)
        });
        CROP_CONFIGS[code].sproutImageUrl = item.config?.sproutImageUrl || '';
        CROP_CONFIGS[code].growingImageUrl = item.config?.growingImageUrl || '';
        CROP_CONFIGS[code].matureImageUrl = item.imageUrl || item.config?.matureImageUrl || '';
    });
    byCode(grouped.animal);
    Object.entries(byCode(grouped.animal)).forEach(([code, item]) => {
        if (!ANIMAL_CONFIGS[code]) return;
        Object.assign(ANIMAL_CONFIGS[code], {
            label: item.name,
            icon: item.config?.icon || ANIMAL_CONFIGS[code].icon,
            feedItemId: item.config?.feed || ANIMAL_CONFIGS[code].feedItemId,
            productItemId: item.config?.product || ANIMAL_CONFIGS[code].productItemId,
            productionSec: Number(item.growthSeconds || ANIMAL_CONFIGS[code].productionSec)
        });
    });
    (grouped.item || []).forEach(item => {
        const category = item.config?.category;
        const target = category === 'fertilizers' ? FERTILIZER_CONFIGS : category === 'feeds' ? FEED_CONFIGS : category === 'animalProducts' ? ANIMAL_PRODUCT_CONFIGS : category === 'buildings' ? BUILDING_CONFIGS : null;
        if (target?.[item.code]) Object.assign(target[item.code], { nameVi: item.name, icon: item.config?.icon || target[item.code].icon, basePrice: Math.round(Number(item.buyPrice || 0) * buyRate) });
        if (category === 'feeds' && FEED_RECIPES[item.code]) FEED_RECIPES[item.code].durationSec = Number(item.growthSeconds || FEED_RECIPES[item.code].durationSec);
    });
    if (Array.isArray(payload.shopProducts)) {
        Object.values(CROP_CONFIGS).forEach(item => Object.assign(item, { shopVisible: false, shopProductId: null }));
        Object.values(FERTILIZER_CONFIGS).forEach(item => Object.assign(item, { shopVisible: false, shopProductId: null }));
        Object.values(BUILDING_CONFIGS).forEach(item => Object.assign(item, { shopVisible: false, shopProductId: null }));
        payload.shopProducts.forEach(product => {
            const price = Math.max(0, Math.round(Number(product.effectivePrice || 0) * buyRate));
            const shopMeta = {
                shopVisible: true, shopProductId: Number(product.id), originalPrice: Math.round(Number(product.buyPrice || 0) * buyRate),
                flashActive: Boolean(product.flashActive), discountActive: Boolean(product.discountActive),
                flashSaleEnd: product.flashSaleEnd || null, purchaseLimit: Number(product.purchaseLimit || 0),
                purchaseLimitType: product.purchaseLimitType || 'none'
            };
            if (product.entityType === 'seed' && CROP_CONFIGS[product.code]) Object.assign(CROP_CONFIGS[product.code], shopMeta, { seedCost: price });
            if (product.entityType === 'item' && FERTILIZER_CONFIGS[product.code]) Object.assign(FERTILIZER_CONFIGS[product.code], shopMeta, { basePrice: price });
            if (product.entityType === 'item' && BUILDING_CONFIGS[product.code]) Object.assign(BUILDING_CONFIGS[product.code], shopMeta, { basePrice: price });
        });
    }
}
