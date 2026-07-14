const DEFAULT_CATALOG = [
    ['crop', 'carrot', 'Cà rốt', 10, 38, 30, 5, 1, { icon: '🥕' }, 1],
    ['crop', 'corn', 'Ngô', 20, 83, 60, 12, 2, { icon: '🌽' }, 2],
    ['crop', 'tomato', 'Cà chua', 40, 165, 120, 25, 4, { icon: '🍅' }, 3],
    ['crop', 'pumpkin', 'Bí ngô', 80, 360, 240, 55, 6, { icon: '🎃' }, 4],
    ['seed', 'carrot', 'Hạt giống Cà rốt', 10, 0, 30, 5, 1, { cropCode: 'carrot', icon: '🥕' }, 1],
    ['seed', 'corn', 'Hạt giống Ngô', 20, 0, 60, 12, 2, { cropCode: 'corn', icon: '🌽' }, 2],
    ['seed', 'tomato', 'Hạt giống Cà chua', 40, 0, 120, 25, 4, { cropCode: 'tomato', icon: '🍅' }, 3],
    ['seed', 'pumpkin', 'Hạt giống Bí ngô', 80, 0, 240, 55, 6, { cropCode: 'pumpkin', icon: '🎃' }, 4],
    ['animal', 'chicken', 'Gà', 0, 0, 60, 5, 1, { feed: 'chicken_feed', product: 'egg', icon: '🐔' }, 1],
    ['animal', 'cow', 'Bò', 0, 0, 120, 10, 2, { feed: 'cow_feed', product: 'milk', icon: '🐄' }, 2],
    ['animal', 'pig', 'Heo', 0, 0, 180, 15, 3, { feed: 'pig_feed', product: 'bacon', icon: '🐖' }, 3],
    ['item', 'mid', 'Phân bón Trung cấp', 50, 0, 0, 0, 1, { category: 'fertilizers', icon: '🧪' }, 1],
    ['item', 'high', 'Phân bón Cao cấp', 150, 0, 0, 0, 1, { category: 'fertilizers', icon: '💎' }, 2],
    ['item', 'chicken_feed', 'Thức ăn gà', 35, 0, 30, 0, 1, { category: 'feeds', icon: '🌾' }, 3],
    ['item', 'cow_feed', 'Thức ăn bò', 55, 0, 45, 0, 1, { category: 'feeds', icon: '🥣' }, 4],
    ['item', 'pig_feed', 'Thức ăn heo', 70, 0, 60, 0, 1, { category: 'feeds', icon: '🥕' }, 5],
    ['item', 'feed_mill', 'Máy trộn thức ăn', 2000, 0, 0, 0, 1, { category: 'buildings', icon: '⚙️' }, 6],
    ['shop', 'seed_store', 'Cửa hàng hạt giống', 0, 0, 0, 0, 1, { discountPercent: 0 }, 1],
    ['setting', 'economy', 'Cấu hình kinh tế', 0, 0, 0, 0, 1, { landStartGold: 10000, landMultiplier: 1.5 }, 1]
];

let cache = null;

function parseJson(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(value || '{}'); } catch { return {}; }
}

async function ensureDefaultCatalog(pool) {
    for (const row of DEFAULT_CATALOG) {
        await pool.query(
            `INSERT IGNORE INTO game_catalog
             (entity_type, code, name, buy_price, sell_price, growth_seconds, xp_reward, unlock_level, config_json, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], JSON.stringify(row[8]), row[9]]
        );
    }
    cache = null;
}

async function getGameConfig(pool, { includeInactive = false, force = false } = {}) {
    if (!force && !includeInactive && cache) return cache;
    const [rows] = await pool.query(
        `SELECT * FROM game_catalog ${includeInactive ? '' : 'WHERE is_active = 1'}
         ORDER BY entity_type, sort_order, id`
    );
    const catalog = rows.map(row => ({
        id: Number(row.id), entityType: row.entity_type, code: row.code, name: row.name,
        imageUrl: row.image_url, buyPrice: Number(row.buy_price), sellPrice: Number(row.sell_price),
        growthSeconds: Number(row.growth_seconds), xpReward: Number(row.xp_reward),
        unlockLevel: Number(row.unlock_level), config: parseJson(row.config_json),
        isActive: Boolean(row.is_active), sortOrder: Number(row.sort_order)
    }));
    const grouped = Object.fromEntries(['crop', 'animal', 'seed', 'item', 'shop', 'quest', 'setting']
        .map(type => [type, catalog.filter(item => item.entityType === type)]));
    const result = { catalog, grouped };
    if (!includeInactive) cache = result;
    return result;
}

function invalidateGameConfig() { cache = null; }

async function refreshRuntimeConfig(pool) {
    const config = await getGameConfig(pool, { force: true });
    require('./itemCatalog').applyCatalogConfig(config.grouped);
    require('./deliveryRules').applyDeliveryConfig(config.grouped);
    return config;
}

module.exports = { DEFAULT_CATALOG, ensureDefaultCatalog, getGameConfig, invalidateGameConfig, refreshRuntimeConfig, parseJson };
