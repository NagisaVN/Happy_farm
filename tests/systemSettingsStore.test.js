const test = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM_SETTING_DEFINITIONS } = require('../server/systemSettingDefinitions');
const { parseValue, serializeValue, validateValue } = require('../server/systemSettingsStore');

function setting(key) {
    const definition = SYSTEM_SETTING_DEFINITIONS.find(item => item.key === key);
    return {
        settingKey: definition.key,
        valueType: definition.type,
        validation: definition.validation
    };
}

test('system settings define every requested key exactly once', () => {
    const keys = SYSTEM_SETTING_DEFINITIONS.map(item => item.key);
    assert.equal(keys.length, 32);
    assert.equal(new Set(keys).size, keys.length);
    ['START_GOLD', 'ENABLE_DELIVERY', 'DEFAULT_INVENTORY', 'SHOP_REFRESH_TIME',
        'LEADERBOARD_SIZE', 'DAILY_MISSION_RESET', 'ENABLE_EVENT', 'MAX_LOGIN_FAIL',
        'MAX_IMAGE_SIZE', 'MAINTENANCE_MODE'].forEach(key => assert.ok(keys.includes(key)));
});

test('setting values preserve number, boolean, string and json types', () => {
    assert.equal(parseValue(serializeValue(12.5, 'number'), 'number'), 12.5);
    assert.equal(parseValue(serializeValue(false, 'boolean'), 'boolean'), false);
    assert.equal(parseValue(serializeValue('hello', 'string'), 'string'), 'hello');
    assert.deepEqual(parseValue(serializeValue({ carrot: 10 }, 'json'), 'json'), { carrot: 10 });
});

test('typed validation rejects invalid values and bounds', () => {
    assert.equal(validateValue('20', setting('LEADERBOARD_SIZE')), 20);
    assert.throws(() => validateValue(-1, setting('START_GOLD')), /START_GOLD/);
    assert.throws(() => validateValue('maybe', setting('ENABLE_EVENT')), /ENABLE_EVENT/);
    assert.throws(() => validateValue('25:00', setting('DAILY_MISSION_RESET')), /DAILY_MISSION_RESET/);
    assert.throws(() => validateValue('[]', setting('DEFAULT_INVENTORY')), /DEFAULT_INVENTORY/);
});
