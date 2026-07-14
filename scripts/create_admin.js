const bcrypt = require('bcryptjs');
require('dotenv').config();
const { initDb, pool, closeDb } = require('../server/db');
function validateAdminLogin(login) {
    if (!login || login.length > 255 || /\s/.test(login)) {
        return 'Tên đăng nhập Admin không hợp lệ.';
    }
    return null;
}

function validateAdminPassword(password) {
    if (!password || password.length > 128) {
        return 'Mật khẩu Admin không hợp lệ.';
    }
    return null;
}

async function main() {
    const email = String(process.argv[2] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.argv[3] || process.env.ADMIN_PASSWORD || '');
    const validationError = validateAdminLogin(email) || validateAdminPassword(password);
    if (validationError) throw new Error(validationError);
    await initDb();
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
        `INSERT INTO users (email, password_hash, role, status)
         VALUES (?, ?, 'admin', 'active')
         ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), role='admin', status='active'`,
        [email, passwordHash]
    );
    console.log(`Admin ready: ${email}`);
}

main().then(() => closeDb()).catch(error => {
    console.error(error.message || error);
    closeDb().finally(() => process.exit(1));
});
