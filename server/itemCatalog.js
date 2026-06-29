const CROPS = {
    carrot: { icon: '🥕', nameVi: 'Cà rốt', seedCost: 10, cropValue: 38 },
    corn: { icon: '🌽', nameVi: 'Ngô', seedCost: 20, cropValue: 83 },
    tomato: { icon: '🍅', nameVi: 'Cà chua', seedCost: 40, cropValue: 165 },
    pumpkin: { icon: '🎃', nameVi: 'Bí ngô', seedCost: 80, cropValue: 360 }
};

const FERTILIZERS = {
    mid: { icon: '🧪', nameVi: 'Phân bón Trung cấp', basePrice: 50 },
    high: { icon: '💎', nameVi: 'Phân bón Cao cấp', basePrice: 150 }
};

function getItemMeta(category, itemId) {
    if (category === 'seeds' && CROPS[itemId]) {
        const crop = CROPS[itemId];
        return {
            category,
            itemId,
            icon: crop.icon,
            name: `Hạt giống ${crop.nameVi}`,
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

    return null;
}

function getStarterInventory() {
    return {
        seeds: { carrot: 10, corn: 10, tomato: 10, pumpkin: 10 },
        crops: { carrot: 5, corn: 5, tomato: 5, pumpkin: 5 },
        fertilizers: { mid: 5, high: 2 }
    };
}

function inventoryToRows(inventory = {}) {
    const rows = [];
    ['seeds', 'crops', 'fertilizers'].forEach(category => {
        Object.entries(inventory[category] || {}).forEach(([itemId, rawQuantity]) => {
            const quantity = Math.max(0, Number.parseInt(rawQuantity, 10) || 0);
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

    rows.forEach(row => {
        if (!inventory[row.category]) {
            inventory[row.category] = {};
        }
        inventory[row.category][row.item_id] = Math.max(0, Number(row.quantity) || 0);
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
    getItemMeta,
    getStarterInventory,
    inventoryToRows,
    rowsToInventory,
    decorateListing
};
