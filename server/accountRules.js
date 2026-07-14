const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 255;
const MAX_FARM_NAME_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeFarmName(value) {
    return String(value || '').trim();
}

function validateEmail(email) {
    if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
        return 'Email không hợp lệ.';
    }
    return null;
}

function validateFarmName(farmName) {
    if (!farmName) return 'Tên nông trại không được để trống.';
    if (farmName.length > MAX_FARM_NAME_LENGTH) {
        return `Tên nông trại không được vượt quá ${MAX_FARM_NAME_LENGTH} ký tự.`;
    }
    return null;
}

function validatePassword(password, label = 'Mật khẩu', minimumLength = MIN_PASSWORD_LENGTH) {
    const value = String(password || '');
    const minLength = Math.max(MIN_PASSWORD_LENGTH, Number.parseInt(minimumLength, 10) || MIN_PASSWORD_LENGTH);
    if (value.length < minLength) {
        return `${label} phải có ít nhất ${minLength} ký tự.`;
    }
    if (value.length > MAX_PASSWORD_LENGTH) {
        return `${label} không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.`;
    }
    return null;
}

module.exports = {
    MAX_FARM_NAME_LENGTH,
    MIN_PASSWORD_LENGTH,
    normalizeEmail,
    normalizeFarmName,
    validateEmail,
    validateFarmName,
    validatePassword
};
