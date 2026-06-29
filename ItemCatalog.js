import { CROP_CONFIGS } from './Seed.js';

const CROP_DISPLAY = {
    carrot: { icon: '🥕', nameVi: 'Cà rốt' },
    corn: { icon: '🌽', nameVi: 'Ngô' },
    tomato: { icon: '🍅', nameVi: 'Cà chua' },
    pumpkin: { icon: '🎃', nameVi: 'Bí ngô' }
};

export const MARKET_CATEGORIES = {
    seeds: 'Hạt giống',
    crops: 'Nông sản',
    fertilizers: 'Phân bón'
};

export const FERTILIZER_CONFIGS = {
    mid: {
        icon: '🧪',
        nameVi: 'Phân bón Trung cấp',
        basePrice: 50
    },
    high: {
        icon: '💎',
        nameVi: 'Phân bón Cao cấp',
        basePrice: 150
    }
};

export function getMarketItemMeta(category, itemId) {
    if (category === 'seeds' && CROP_CONFIGS[itemId]) {
        const crop = CROP_CONFIGS[itemId];
        const display = CROP_DISPLAY[itemId] || crop;
        return {
            category,
            itemId,
            icon: display.icon,
            name: `Hạt giống ${display.nameVi}`,
            minPrice: crop.seedCost,
            maxPrice: crop.seedCost * 5
        };
    }

    if (category === 'crops' && CROP_CONFIGS[itemId]) {
        const crop = CROP_CONFIGS[itemId];
        const display = CROP_DISPLAY[itemId] || crop;
        return {
            category,
            itemId,
            icon: display.icon,
            name: display.nameVi,
            minPrice: crop.cropValue,
            maxPrice: crop.cropValue * 3
        };
    }

    if (category === 'fertilizers' && FERTILIZER_CONFIGS[itemId]) {
        const fertilizer = FERTILIZER_CONFIGS[itemId];
        return {
            category,
            itemId,
            icon: fertilizer.icon,
            name: fertilizer.nameVi,
            minPrice: fertilizer.basePrice,
            maxPrice: fertilizer.basePrice * 5
        };
    }

    return {
        category,
        itemId,
        icon: '📦',
        name: itemId,
        minPrice: 1,
        maxPrice: 999999
    };
}

export function listMarketItems() {
    const items = [];
    Object.keys(CROP_CONFIGS).forEach(itemId => {
        items.push(getMarketItemMeta('seeds', itemId));
        items.push(getMarketItemMeta('crops', itemId));
    });
    Object.keys(FERTILIZER_CONFIGS).forEach(itemId => {
        items.push(getMarketItemMeta('fertilizers', itemId));
    });
    return items;
}

export function getInventoryQuantity(inventory, category, itemId) {
    return inventory?.[category]?.[itemId] || 0;
}
