const { GROUPS, SYSTEM_SETTING_DEFINITIONS } = require('./systemSettingDefinitions');

let cache = null;
const definitionByKey = new Map(SYSTEM_SETTING_DEFINITIONS.map(item => [item.key, item]));

function serializeValue(value, type) {
    if (type === 'json') return JSON.stringify(value);
    if (type === 'boolean') return value ? 'true' : 'false';
    return String(value);
}

function parseValue(value, type) {
    if (type === 'number') return Number(value);
    if (type === 'boolean') return String(value).toLowerCase() === 'true' || String(value) === '1';
    if (type === 'json') {
        if (value && typeof value === 'object') return value;
        return JSON.parse(String(value || 'null'));
    }
    return String(value ?? '');
}

function validateValue(rawValue, setting) {
    let value;
    try {
        if (setting.valueType === 'number') {
            if (rawValue === '' || rawValue === null || rawValue === undefined) throw new Error();
            value = Number(rawValue);
            if (!Number.isFinite(value)) throw new Error();
        } else if (setting.valueType === 'boolean') {
            if (![true, false, 1, 0, 'true', 'false', '1', '0'].includes(rawValue)) throw new Error();
            value = rawValue === true || rawValue === 1 || rawValue === 'true' || rawValue === '1';
        } else if (setting.valueType === 'json') {
            value = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
            if (value === null || typeof value !== 'object') throw new Error();
        } else if (setting.valueType === 'string') {
            value = String(rawValue ?? '');
        } else throw new Error();
    } catch {
        throw new Error(`${setting.settingKey} phải có kiểu ${setting.valueType}.`);
    }

    const rules = setting.validation || {};
    if (setting.valueType === 'number') {
        if (rules.integer && !Number.isInteger(value)) throw new Error(`${setting.settingKey} phải là số nguyên.`);
        if (rules.min !== undefined && value < rules.min) throw new Error(`${setting.settingKey} phải từ ${rules.min} trở lên.`);
        if (rules.max !== undefined && value > rules.max) throw new Error(`${setting.settingKey} không được vượt quá ${rules.max}.`);
    }
    if (setting.valueType === 'string') {
        if (rules.maxLength && value.length > rules.maxLength) throw new Error(`${setting.settingKey} không được vượt quá ${rules.maxLength} ký tự.`);
        if (rules.pattern && !(new RegExp(rules.pattern, 'i')).test(value)) throw new Error(`${setting.settingKey} không đúng định dạng.`);
    }
    if (setting.valueType === 'json' && rules.object && (Array.isArray(value) || value === null)) {
        throw new Error(`${setting.settingKey} phải là JSON object.`);
    }
    return value;
}

function mapRow(row) {
    const validation = row.validation_json && typeof row.validation_json === 'object'
        ? row.validation_json
        : JSON.parse(row.validation_json || '{}');
    return {
        id: Number(row.id), groupName: row.group_name, groupLabel: GROUPS[row.group_name] || row.group_name,
        settingKey: row.setting_key, settingName: row.setting_name,
        value: parseValue(row.setting_value, row.value_type),
        defaultValue: parseValue(row.default_value, row.value_type),
        valueType: row.value_type, description: row.description || '', validation,
        isEditable: Boolean(row.is_editable), updatedAt: row.updated_at
    };
}

async function ensureDefaultSystemSettings(pool) {
    for (const item of SYSTEM_SETTING_DEFINITIONS) {
        await pool.query(
            `INSERT IGNORE INTO system_settings
             (group_name,setting_key,setting_name,setting_value,default_value,value_type,description,validation_json,is_editable)
             VALUES (?,?,?,?,?,?,?,?,1)`,
            [item.group, item.key, item.name, serializeValue(item.value, item.type), serializeValue(item.value, item.type), item.type, item.description, JSON.stringify(item.validation || {})]
        );
    }
    return refreshSystemSettings(pool);
}

async function refreshSystemSettings(pool) {
    const [rows] = await pool.query('SELECT * FROM system_settings ORDER BY group_name, id');
    const settings = rows.map(mapRow);
    cache = {
        settings,
        byId: new Map(settings.map(item => [item.id, item])),
        byKey: new Map(settings.map(item => [item.settingKey, item]))
    };
    return cache;
}

async function getSystemSettings(pool, { force = false } = {}) {
    if (!cache || force) return refreshSystemSettings(pool);
    return cache;
}

function invalidateSystemSettings() { cache = null; }

function getSettingValue(key, fallback) {
    const cached = cache?.byKey.get(key);
    if (cached) return cached.value;
    const definition = definitionByKey.get(key);
    return definition ? definition.value : fallback;
}

function getSettingsObject({ publicOnly = false } = {}) {
    const blockedKeys = new Set(['MAX_LOGIN_FAIL', 'SESSION_TIMEOUT', 'MAX_IMAGE_SIZE', 'ALLOWED_IMAGE_TYPE']);
    return Object.fromEntries((cache?.settings || []).filter(item => !publicOnly || !blockedKeys.has(item.settingKey)).map(item => [item.settingKey, item.value]));
}

module.exports = {
    ensureDefaultSystemSettings, getSystemSettings, refreshSystemSettings, invalidateSystemSettings,
    getSettingValue, getSettingsObject, validateValue, serializeValue, parseValue, mapRow
};
