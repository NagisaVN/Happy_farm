const ENTITY_TYPES = new Set(['crop', 'animal', 'seed', 'item', 'shop', 'quest', 'setting']);

function cleanText(value, maxLength = 128) {
    return String(value ?? '').trim().slice(0, maxLength);
}

function nonNegativeInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function normalizeCatalogPayload(input = {}) {
    const entityType = cleanText(input.entityType || input.entity_type, 32);
    const code = cleanText(input.code, 64).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const name = cleanText(input.name, 128);
    if (!ENTITY_TYPES.has(entityType)) throw new Error('Loại nội dung không hợp lệ.');
    if (!code) throw new Error('Mã nội dung không được để trống.');
    if (!name) throw new Error('Tên nội dung không được để trống.');
    const config = input.config && typeof input.config === 'object' && !Array.isArray(input.config)
        ? input.config
        : {};
    return {
        entityType,
        code,
        name,
        imageUrl: cleanText(input.imageUrl || input.image_url, 512) || null,
        buyPrice: nonNegativeInt(input.buyPrice ?? input.buy_price),
        sellPrice: nonNegativeInt(input.sellPrice ?? input.sell_price),
        growthSeconds: nonNegativeInt(input.growthSeconds ?? input.growth_seconds),
        xpReward: nonNegativeInt(input.xpReward ?? input.xp_reward),
        unlockLevel: Math.max(1, nonNegativeInt(input.unlockLevel ?? input.unlock_level, 1)),
        config,
        isActive: input.isActive === undefined && input.is_active === undefined
            ? true
            : Boolean(input.isActive ?? input.is_active),
        sortOrder: nonNegativeInt(input.sortOrder ?? input.sort_order)
    };
}

function normalizeEventPayload(input = {}) {
    const name = cleanText(input.name, 128);
    const startsAt = new Date(input.startsAt || input.starts_at);
    const endsAt = new Date(input.endsAt || input.ends_at);
    if (!name) throw new Error('Tên sự kiện không được để trống.');
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        throw new Error('Thời gian sự kiện không hợp lệ.');
    }
    return {
        name,
        bannerUrl: cleanText(input.bannerUrl || input.banner_url, 512) || null,
        startsAt,
        endsAt,
        reward: input.reward && typeof input.reward === 'object' ? input.reward : {},
        condition: input.condition && typeof input.condition === 'object' ? input.condition : {},
        isActive: input.isActive === undefined ? true : Boolean(input.isActive)
    };
}

module.exports = { ENTITY_TYPES, cleanText, nonNegativeInt, normalizeCatalogPayload, normalizeEventPayload };
