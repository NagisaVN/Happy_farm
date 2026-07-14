const CROPS = {
    carrot: { icon: '🥕', nameVi: 'Cà rốt', seedCost: 10, cropValue: 38, requiredLevel: 1 },
    corn: { icon: '🌽', nameVi: 'Ngô', seedCost: 20, cropValue: 83, requiredLevel: 2 },
    tomato: { icon: '🍅', nameVi: 'Cà chua', seedCost: 40, cropValue: 165, requiredLevel: 4 },
    pumpkin: { icon: '🎃', nameVi: 'Bí ngô', seedCost: 80, cropValue: 360, requiredLevel: 6 }
};

const FERTILIZERS = {
    mid: { icon: '🧪', nameVi: 'Phân bón Trung cấp', basePrice: 50 },
    high: { icon: '💎', nameVi: 'Phân bón Cao cấp', basePrice: 150 }
};

const FEEDS = {
    chicken_feed: { icon: '🌾', nameVi: 'Thức ăn gà', basePrice: 35 },
    cow_feed: { icon: '🥣', nameVi: 'Thức ăn bò', basePrice: 55 },
    pig_feed: { icon: '🥕', nameVi: 'Thức ăn heo', basePrice: 70 }
};

const ANIMAL_PRODUCTS = {
    egg: { icon: '🥚', nameVi: 'Trứng gà', basePrice: 120 },
    milk: { icon: '🥛', nameVi: 'Sữa bò', basePrice: 240 },
    bacon: { icon: '🥓', nameVi: 'Bacon', basePrice: 380 }
};

const BUILDINGS = {
    feed_mill: { icon: '⚙️', nameVi: 'Máy trộn thức ăn', basePrice: 2000 }
};

const INVENTORY_CATEGORIES = ['seeds', 'crops', 'fertilizers', 'feeds', 'animalProducts', 'buildings'];

function applyCatalogConfig(grouped = {}) {
    const { getSettingValue } = require('./systemSettingsStore');
    const buyRate = Math.max(0, Number(getSettingValue('BUY_RATE', 1)) || 0);
    const sellRate = Math.max(0, Number(getSettingValue('SELL_RATE', 1)) || 0);
    const discountEnabled = Boolean(getSettingValue('ENABLE_DISCOUNT', true));
    const seeds = Object.fromEntries((grouped.seed || []).map(item => [item.code, item]));
    const seedShop = (grouped.shop || []).find(item => item.code === 'seed_store');
    const discountFactor = discountEnabled ? Math.max(0, 1 - (Number(seedShop?.config?.discountPercent || 0) / 100)) : 1;
    (grouped.crop || []).forEach(item => {
        if (!CROPS[item.code]) return;
        const seed = seeds[item.code] || item;
        Object.assign(CROPS[item.code], {
            icon: item.config?.icon || CROPS[item.code].icon,
            nameVi: item.name,
            seedCost: Math.round(Number(seed.buyPrice || 0) * discountFactor * buyRate),
            cropValue: Math.round(Number(item.sellPrice || 0) * sellRate),
            requiredLevel: Number(seed.unlockLevel || item.unlockLevel || 1),
            xpReward: Number(item.xpReward || 0)
        });
    });
    (grouped.item || []).forEach(item => {
        const targets = { fertilizers: FERTILIZERS, feeds: FEEDS, animalProducts: ANIMAL_PRODUCTS, buildings: BUILDINGS };
        const target = targets[item.config?.category];
        if (target?.[item.code]) Object.assign(target[item.code], { icon: item.config?.icon || target[item.code].icon, nameVi: item.name, basePrice: Math.round(Number(item.buyPrice || 0) * buyRate) });
    });
}

function getItemMeta(category, itemId) {
    if (category === 'seeds' && CROPS[itemId]) {
        const crop = CROPS[itemId];
        return {
            category,
            itemId,
            icon: crop.icon,
            name: `Hạt giống ${crop.nameVi}`,
            requiredLevel: crop.requiredLevel,
            minPrice: crop.seedCost,
            maxPrice: crop.seedCost * 5
        };
    }

    if (category === 'crops' && CROPS[itemId]) {
        const crop = CROPS[itemId];
        return {
            category,
            itemId,
            icon: crop.icon,
            name: crop.nameVi,
            minPrice: crop.cropValue,
            maxPrice: crop.cropValue * 3
        };
    }

    if (category === 'fertilizers' && FERTILIZERS[itemId]) {
        const fertilizer = FERTILIZERS[itemId];
        return {
            category,
            itemId,
            icon: fertilizer.icon,
            name: fertilizer.nameVi,
            minPrice: fertilizer.basePrice,
            maxPrice: fertilizer.basePrice * 5
        };
    }

    if (category === 'feeds' && FEEDS[itemId]) {
        const feed = FEEDS[itemId];
        return {
            category,
            itemId,
            icon: feed.icon,
            name: feed.nameVi,
            minPrice: feed.basePrice,
            maxPrice: feed.basePrice * 5
        };
    }

    if (category === 'animalProducts' && ANIMAL_PRODUCTS[itemId]) {
        const product = ANIMAL_PRODUCTS[itemId];
        return {
            category,
            itemId,
            icon: product.icon,
            name: product.nameVi,
            minPrice: product.basePrice,
            maxPrice: product.basePrice * 4
        };
    }

    if (category === 'buildings' && BUILDINGS[itemId]) {
        const building = BUILDINGS[itemId];
        return {
            category,
            itemId,
            icon: building.icon,
            name: building.nameVi,
            minPrice: building.basePrice,
            maxPrice: building.basePrice
        };
    }

    return null;
}

function getStarterInventory() {
    return {
        seeds: { carrot: 10, corn: 0, tomato: 0, pumpkin: 0 },
        crops: { carrot: 0, corn: 0, tomato: 0, pumpkin: 0 },
        fertilizers: { mid: 5, high: 2 },
        feeds: { chicken_feed: 3, cow_feed: 2, pig_feed: 2 },
        animalProducts: { egg: 0, milk: 0, bacon: 0 },
        buildings: { feed_mill: 0 }
    };
}

function inventoryToRows(inventory = {}) {
    const rows = [];
    INVENTORY_CATEGORIES.forEach(category => {
        Object.entries(inventory[category] || {}).forEach(([itemId, rawQuantity]) => {
            const parsed = Math.max(0, Number.parseInt(rawQuantity, 10) || 0);
            const quantity = category === 'buildings' ? Math.min(1, parsed) : parsed;
            if (getItemMeta(category, itemId)) {
                rows.push({ category, itemId, quantity });
            }
        });
    });
    return rows;
}

function rowsToInventory(rows = []) {
    const inventory = getStarterInventory();
    inventory.seeds = { carrot: 0, corn: 0, tomato: 0, pumpkin: 0 };
    inventory.crops = { carrot: 0, corn: 0, tomato: 0, pumpkin: 0 };
    inventory.fertilizers = { mid: 0, high: 0 };
    inventory.animalProducts = { egg: 0, milk: 0, bacon: 0 };
    inventory.buildings = { feed_mill: 0 };

    rows.forEach(row => {
        if (!inventory[row.category]) {
            inventory[row.category] = {};
        }
        const quantity = Math.max(0, Number(row.quantity) || 0);
        inventory[row.category][row.item_id] = row.category === 'buildings' ? Math.min(1, quantity) : quantity;
    });

    return inventory;
}

function decorateListing(row) {
    const meta = getItemMeta(row.category, row.item_id) || {
        icon: '📦',
        name: row.item_id,
        minPrice: 1,
        maxPrice: 999999
    };

    return {
        id: Number(row.id),
        sellerUserId: Number(row.seller_user_id),
        farmId: Number(row.farm_id),
        farmName: row.farm_name,
        sellerName: row.seller_name,
        category: row.category,
        itemId: row.item_id,
        quantity: Number(row.quantity),
        priceEach: Number(row.price_each),
        totalPrice: Number(row.quantity) * Number(row.price_each),
        createdAt: row.created_at,
        item: meta
    };
}

module.exports = {
    CROPS,
    FERTILIZERS,
    FEEDS,
    ANIMAL_PRODUCTS,
    BUILDINGS,
    INVENTORY_CATEGORIES,
    getItemMeta,
    getStarterInventory,
    inventoryToRows,
    rowsToInventory,
    decorateListing,
    applyCatalogConfig
};
