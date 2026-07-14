const { parseJson } = require('./gameConfigStore');

let publicCache = null;
const DEFAULT_CATEGORIES = [
    ['seeds', 'Hạt giống', 'seed', 1], ['animals', 'Vật nuôi', 'animal', 2],
    ['items', 'Vật phẩm', 'item', 3], ['decorations', 'Trang trí', 'decoration', 4]
];

function invalidateShopCache() { publicCache = null; }

function effectivePrice(row, now = new Date()) {
    const basePrice = Number(row.buy_price || 0);
    const start = row.flash_sale_start ? new Date(row.flash_sale_start) : null;
    const end = row.flash_sale_end ? new Date(row.flash_sale_end) : null;
    const stockAvailable = row.flash_stock_limit == null || Number(row.flash_sold_count) < Number(row.flash_stock_limit);
    const flashActive = row.flash_sale_price != null && start && end && start <= now && end > now && stockAvailable;
    if (flashActive) return { price: Number(row.flash_sale_price), flashActive: true, discountActive: true };
    let price = basePrice;
    if (row.sale_type === 'percent') price = Math.max(0, Math.round(basePrice * (1 - (Number(row.sale_value) / 100))));
    if (row.sale_type === 'fixed') price = Math.max(0, Math.round(basePrice - Number(row.sale_value)));
    return { price, flashActive: false, discountActive: row.sale_type !== 'none' && Number(row.sale_value) > 0 };
}

function mapProduct(row, now = new Date()) {
    const pricing = effectivePrice(row, now);
    return {
        id: Number(row.id), catalogItemId: Number(row.catalog_item_id), categoryId: Number(row.category_id),
        categoryCode: row.category_code, categoryName: row.category_name, entityType: row.entity_type,
        code: row.code, name: row.name, imageUrl: row.image_url, icon: parseJson(row.config_json).icon || '📦',
        config: parseJson(row.config_json), buyPrice: Number(row.buy_price), sellPrice: Number(row.sell_price),
        effectivePrice: pricing.price, saleType: row.sale_type, saleValue: Number(row.sale_value),
        discountActive: pricing.discountActive, flashActive: pricing.flashActive,
        flashSalePrice: row.flash_sale_price == null ? null : Number(row.flash_sale_price),
        flashSaleStart: row.flash_sale_start, flashSaleEnd: row.flash_sale_end,
        flashStockLimit: row.flash_stock_limit == null ? null : Number(row.flash_stock_limit), flashSoldCount: Number(row.flash_sold_count),
        purchaseLimit: Number(row.purchase_limit), purchaseLimitType: row.purchase_limit_type,
        displayOrder: Number(row.display_order), status: row.status, isActive: Boolean(row.is_active),
        unlockLevel: Number(row.unlock_level), updatedAt: row.updated_at
    };
}

const SHOP_SELECT = `SELECT sp.*,gc.entity_type,gc.code,gc.name,gc.image_url,gc.buy_price,gc.sell_price,gc.unlock_level,gc.config_json,
    sc.code category_code,sc.name category_name,sc.catalog_entity_type
    FROM shop_products sp JOIN game_catalog gc ON gc.id=sp.catalog_item_id
    JOIN shop_categories sc ON sc.id=sp.category_id`;

async function ensureDefaultShop(pool) {
    for (const category of DEFAULT_CATEGORIES) {
        await pool.query('INSERT IGNORE INTO shop_categories (code,name,catalog_entity_type,display_order) VALUES (?,?,?,?)', category);
    }
    const [categories] = await pool.query('SELECT * FROM shop_categories');
    const byCode = Object.fromEntries(categories.map(item => [item.code, item]));
    const [catalog] = await pool.query("SELECT * FROM game_catalog WHERE entity_type IN ('seed','item') ORDER BY sort_order,id");
    for (const item of catalog) {
        const config = parseJson(item.config_json);
        const category = item.entity_type === 'seed' ? byCode.seeds : (['fertilizers', 'buildings'].includes(config.category) ? byCode.items : null);
        if (!category) continue;
        await pool.query(
            `INSERT IGNORE INTO shop_products (catalog_item_id,category_id,display_order,status,is_active)
             VALUES (?,?,?,'selling',1)`,
            [item.id, category.id, item.sort_order]
        );
    }
    invalidateShopCache();
}

async function getCategories(pool, { activeOnly = false } = {}) {
    const [rows] = await pool.query(`SELECT * FROM shop_categories ${activeOnly ? 'WHERE is_active=1' : ''} ORDER BY display_order,id`);
    return rows.map(row => ({ ...row, id: Number(row.id), display_order: Number(row.display_order), is_active: Boolean(row.is_active) }));
}

async function getAdminProducts(pool) {
    const [rows] = await pool.query(`${SHOP_SELECT} ORDER BY sp.display_order,sp.id`);
    return rows.map(row => mapProduct(row));
}

async function getPublicProducts(pool, { force = false } = {}) {
    const mapAndSort = rows => rows.map(row => mapProduct(row)).sort((a, b) => Number(b.flashActive) - Number(a.flashActive) || Number(b.discountActive) - Number(a.discountActive) || a.displayOrder - b.displayOrder || a.id - b.id);
    if (publicCache && !force) return mapAndSort(publicCache);
    const [rows] = await pool.query(`${SHOP_SELECT} WHERE sp.is_active=1 AND sp.status='selling' AND sc.is_active=1
        ORDER BY (sp.flash_sale_price IS NOT NULL AND NOW() BETWEEN sp.flash_sale_start AND sp.flash_sale_end) DESC,
        (sp.sale_type <> 'none' AND sp.sale_value > 0) DESC,sp.display_order,sp.id`);
    publicCache = rows;
    return mapAndSort(rows);
}

function purchasePeriodKey(type, now = new Date()) {
    const local = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const date = local.toISOString().slice(0, 10);
    if (type === 'daily') return date;
    if (type === 'weekly') {
        const day = local.getUTCDay() || 7;
        return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - day + 1)).toISOString().slice(0, 10);
    }
    return 'account';
}

module.exports = {
    SHOP_SELECT, ensureDefaultShop, getCategories, getAdminProducts, getPublicProducts,
    invalidateShopCache, effectivePrice, mapProduct, purchasePeriodKey
};
