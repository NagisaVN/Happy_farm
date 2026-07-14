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
    fertilizers: 'Phân bón',
    feeds: 'Thức ăn',
    animalProducts: 'Sản phẩm vật nuôi'
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

export const FEED_CONFIGS = {
    chicken_feed: {
        icon: '🌾',
        nameVi: 'Thức ăn gà',
        basePrice: 35
    },
    cow_feed: {
        icon: '🥣',
        nameVi: 'Thức ăn bò',
        basePrice: 55
    },
    pig_feed: {
        icon: '🥕',
        nameVi: 'Thức ăn heo',
        basePrice: 70
    }
};

export const ANIMAL_PRODUCT_CONFIGS = {
    egg: {
        icon: '🥚',
        nameVi: 'Trứng gà',
        basePrice: 120
    },
    milk: {
        icon: '🥛',
        nameVi: 'Sữa bò',
        basePrice: 240
    },
    bacon: {
        icon: '🥓',
        nameVi: 'Bacon',
        basePrice: 380
    }
};

export const BUILDING_CONFIGS = {
    feed_mill: {
        icon: '⚙️',
        nameVi: 'Máy trộn thức ăn',
        basePrice: 2000
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
            requiredLevel: crop.requiredLevel,
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

    if (category === 'feeds' && FEED_CONFIGS[itemId]) {
        const feed = FEED_CONFIGS[itemId];
        return {
            category,
            itemId,
            icon: feed.icon,
            name: feed.nameVi,
            minPrice: feed.basePrice,
            maxPrice: feed.basePrice * 5
        };
    }

    if (category === 'animalProducts' && ANIMAL_PRODUCT_CONFIGS[itemId]) {
        const product = ANIMAL_PRODUCT_CONFIGS[itemId];
        return {
            category,
            itemId,
            icon: product.icon,
            name: product.nameVi,
            minPrice: product.basePrice,
            maxPrice: product.basePrice * 4
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
    Object.keys(FEED_CONFIGS).forEach(itemId => {
        items.push(getMarketItemMeta('feeds', itemId));
    });
    Object.keys(ANIMAL_PRODUCT_CONFIGS).forEach(itemId => {
        items.push(getMarketItemMeta('animalProducts', itemId));
    });
    return items;
}

export function getInventoryQuantity(inventory, category, itemId) {
    return inventory?.[category]?.[itemId] || 0;
}
