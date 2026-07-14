const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const databaseName = process.env.DB_NAME || 'happy_farm';

if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error('DB_NAME may only contain letters, numbers, and underscores');
}

const baseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: true,
    multipleStatements: true
};

const adminPool = mysql.createPool(baseConfig);
const pool = mysql.createPool({
    ...baseConfig,
    database: databaseName
});

async function initDb() {
    await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    await ensureUserColumns();
    await ensureCatalogTypeColumn();
}

async function ensureCatalogTypeColumn() {
    const [[column]] = await pool.query(
        `SELECT DATA_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'game_catalog' AND COLUMN_NAME = 'entity_type'`,
        [databaseName]
    );
    if (column?.DATA_TYPE === 'enum') {
        await pool.query('ALTER TABLE game_catalog MODIFY entity_type VARCHAR(32) NOT NULL');
    }
}

async function closeDb() {
    await Promise.allSettled([pool.end(), adminPool.end()]);
}

async function ensureUserColumns() {
    const [columns] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
        [databaseName]
    );
    const names = new Set(columns.map(column => column.COLUMN_NAME));
    if (!names.has('role')) {
        await pool.query("ALTER TABLE users ADD COLUMN role ENUM('player', 'admin') NOT NULL DEFAULT 'player' AFTER password_hash");
    }
    if (!names.has('status')) {
        await pool.query("ALTER TABLE users ADD COLUMN status ENUM('active', 'locked') NOT NULL DEFAULT 'active' AFTER role");
    }
    if (!names.has('last_login_at')) {
        await pool.query('ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL AFTER status');
    }
    if (!names.has('failed_login_attempts')) {
        await pool.query('ALTER TABLE users ADD COLUMN failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_login_at');
    }
}

module.exports = {
    pool,
    initDb,
    closeDb
};
