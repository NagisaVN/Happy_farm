const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeEmail,
    normalizeFarmName,
    validateEmail,
    validateFarmName,
    validatePassword
} = require('../server/accountRules');

test('profile values are normalized before saving', () => {
    assert.equal(normalizeEmail('  Farmer@Example.COM '), 'farmer@example.com');
    assert.equal(normalizeFarmName('  Vườn Xanh  '), 'Vườn Xanh');
});

test('profile validation rejects invalid email and farm names', () => {
    assert.ok(validateEmail('invalid-email'));
    assert.equal(validateEmail('farmer@example.com'), null);
    assert.ok(validateFarmName(''));
    assert.ok(validateFarmName('x'.repeat(33)));
    assert.equal(validateFarmName('Nông Trại Vui Vẻ'), null);
});

test('new passwords must stay within supported length', () => {
    assert.ok(validatePassword('12345', 'Mật khẩu mới'));
    assert.equal(validatePassword('123456', 'Mật khẩu mới'), null);
    assert.ok(validatePassword('x'.repeat(129), 'Mật khẩu mới'));
});
