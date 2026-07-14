const SALE_TYPES = new Set(['none', 'percent', 'fixed']);
const LIMIT_TYPES = new Set(['none', 'daily', 'weekly', 'account']);
const SHOP_STATUSES = new Set(['selling', 'hidden', 'out_of_stock', 'discontinued']);

function text(value, max, field) {
    const result = String(value || '').trim();
    if (!result || result.length > max) throw new Error(`${field} không hợp lệ.`);
    return result;
}

function nonNegativeInt(value, field) {
    const number = Number(value ?? 0);
    if (!Number.isInteger(number) || number < 0 || number > 2147483647) throw new Error(`${field} phải là số nguyên không âm.`);
    return number;
}

function optionalDate(value, field) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`${field} không hợp lệ.`);
    return date;
}

function normalizeShopPayload(input = {}, categories = []) {
    const categoryId = Number.parseInt(input.categoryId ?? input.category_id, 10);
    const category = categories.find(item => Number(item.id) === categoryId);
    if (!category) throw new Error('Danh mục cửa hàng không hợp lệ.');
    const name = text(input.name, 128, 'Tên sản phẩm');
    const code = text(input.code, 64, 'Mã sản phẩm').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const buyPrice = nonNegativeInt(input.buyPrice ?? input.buy_price, 'Giá mua');
    const sellPrice = nonNegativeInt(input.sellPrice ?? input.sell_price, 'Giá bán');
    const saleType = SALE_TYPES.has(input.saleType ?? input.sale_type) ? (input.saleType ?? input.sale_type) : 'none';
    const saleValue = Number(input.saleValue ?? input.sale_value ?? 0);
    if (!Number.isFinite(saleValue) || saleValue < 0) throw new Error('Giá trị giảm giá không được âm.');
    if (saleType === 'percent' && saleValue > 100) throw new Error('Giảm giá phần trăm không được vượt quá 100%.');
    if (saleType === 'fixed' && saleValue > buyPrice) throw new Error('Số tiền giảm không được lớn hơn giá mua.');
    const flashSalePriceRaw = input.flashSalePrice ?? input.flash_sale_price;
    const flashSalePrice = flashSalePriceRaw === '' || flashSalePriceRaw === null || flashSalePriceRaw === undefined ? null : nonNegativeInt(flashSalePriceRaw, 'Giá Flash Sale');
    const flashSaleStart = optionalDate(input.flashSaleStart ?? input.flash_sale_start, 'Ngày bắt đầu Flash Sale');
    const flashSaleEnd = optionalDate(input.flashSaleEnd ?? input.flash_sale_end, 'Ngày kết thúc Flash Sale');
    if ((flashSaleStart && !flashSaleEnd) || (!flashSaleStart && flashSaleEnd)) throw new Error('Flash Sale phải có đủ ngày bắt đầu và kết thúc.');
    if (flashSaleStart && flashSaleEnd && flashSaleEnd <= flashSaleStart) throw new Error('Flash Sale phải kết thúc sau ngày bắt đầu.');
    if (flashSalePrice !== null && flashSalePrice > buyPrice) throw new Error('Giá Flash Sale không được lớn hơn giá gốc.');
    const purchaseLimit = nonNegativeInt(input.purchaseLimit ?? input.purchase_limit, 'Giới hạn mua');
    const purchaseLimitType = LIMIT_TYPES.has(input.purchaseLimitType ?? input.purchase_limit_type) ? (input.purchaseLimitType ?? input.purchase_limit_type) : 'none';
    if (purchaseLimitType !== 'none' && purchaseLimit < 1) throw new Error('Giới hạn mua phải lớn hơn 0.');
    const status = SHOP_STATUSES.has(input.status) ? input.status : 'selling';
    let config = input.config || {};
    if (typeof config === 'string') {
        try { config = JSON.parse(config || '{}'); } catch { throw new Error('Cấu hình mở rộng phải là JSON hợp lệ.'); }
    }
    return {
        category, categoryId, entityType: category.catalog_entity_type, name, code,
        imageUrl: String(input.imageUrl ?? input.image_url ?? '').trim().slice(0, 512) || null,
        buyPrice, sellPrice, saleType, saleValue: saleType === 'none' ? 0 : saleValue,
        flashSalePrice, flashSaleStart, flashSaleEnd,
        flashStockLimit: flashSalePrice === null ? null : (nonNegativeInt(input.flashStockLimit ?? input.flash_stock_limit, 'Số lượng Flash Sale') || null),
        purchaseLimit: purchaseLimitType === 'none' ? 0 : purchaseLimit, purchaseLimitType,
        displayOrder: Number.parseInt(input.displayOrder ?? input.display_order, 10) || 0,
        status, isActive: input.isActive === undefined ? status === 'selling' : Boolean(input.isActive),
        unlockLevel: Math.max(1, Number.parseInt(input.unlockLevel ?? input.unlock_level, 10) || 1), config
    };
}

module.exports = { SALE_TYPES, LIMIT_TYPES, SHOP_STATUSES, normalizeShopPayload };
