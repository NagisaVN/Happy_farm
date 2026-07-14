const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool, initDb } = require('./db');
const { getItemMeta, decorateListing } = require('./itemCatalog');
const { buildLevelLeaderboard } = require('./levelLeaderboard');
const { createAuthenticate, authorize } = require('./authMiddleware');
const { createAdminRouter } = require('./adminRouter');
const { writeAuditLog, requestIp } = require('./auditLog');
const { ensureDefaultCatalog, getGameConfig, refreshRuntimeConfig } = require('./gameConfigStore');
const { ensureDefaultSystemSettings, getSettingValue, getSettingsObject } = require('./systemSettingsStore');
const { ensureDefaultShop, getPublicProducts, SHOP_SELECT, effectivePrice, purchasePeriodKey, invalidateShopCache } = require('./shopStore');
const {
    normalizeEmail,
    normalizeFarmName,
    validateEmail,
    validateFarmName,
    validatePassword
} = require('./accountRules');
const {
    createPlayerState,
    savePlayerState,
    getCanonicalState,
    addInventoryItem,
    setInventoryQuantity
} = require('./stateStore');
const {
    getOrderSlotCount,
    TRASH_COOLDOWN_MS,
    getWeekInfo,
    getPreviousWeekInfo,
    generateOrder,
    applyRewardToState,
    getRankReward,
    decorateMilestones,
    getCooldownRemainingMs
} = require('./deliveryRules');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const STALL_SLOT_LIMIT = 8;

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true
}));
app.use(express.json({ limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

function signToken(user, farm) {
    return jwt.sign(
        {
            sub: String(user.id),
            email: user.email,
            role: user.role || 'player',
            farmId: farm?.id ? String(farm.id) : null
        },
        JWT_SECRET,
        { expiresIn: `${getSettingValue('SESSION_TIMEOUT', 10080)}m` }
    );
}

function profileFromRows(user, farm) {
    return {
        id: Number(user.id),
        email: user.email,
        farmId: Number(farm.id),
        farmName: farm.name
    };
}

function publicSellerName(email) {
    return String(email || 'farmer').split('@')[0];
}

const authenticate = createAuthenticate(pool, JWT_SECRET, { getSessionTimeoutMinutes: () => getSettingValue('SESSION_TIMEOUT', 10080) });
const authRequired = [authenticate, authorize('player')];

app.use('/api/admin', createAdminRouter({ pool, jwtSecret: JWT_SECRET }));

app.use('/api', (req, res, next) => {
    if (req.path === '/health' || !getSettingValue('MAINTENANCE_MODE', false)) return next();
    return res.status(503).json({
        error: getSettingValue('MAINTENANCE_MESSAGE', 'Hệ thống đang bảo trì. Vui lòng quay lại sau.'),
        maintenance: true
    });
});

function requireEnabled(settingKey, message) {
    return (req, res, next) => getSettingValue(settingKey, true)
        ? next()
        : res.status(503).json({ error: message, featureDisabled: settingKey });
}

app.use('/api/orders', requireEnabled('ENABLE_DELIVERY', 'Chức năng giao hàng đang tạm tắt.'));
app.use('/api/weekly', requireEnabled('ENABLE_DELIVERY', 'Chức năng giao hàng đang tạm tắt.'));
app.use('/api/leaderboard/weekly', requireEnabled('ENABLE_DELIVERY', 'Chức năng giao hàng đang tạm tắt.'));

async function getFarmForUser(conn, userId) {
    const [[farm]] = await conn.query('SELECT * FROM farms WHERE user_id = ?', [userId]);
    return farm;
}

async function getActiveListings(whereSql = '', params = []) {
    const [rows] = await pool.query(
        `SELECT ml.*, f.name AS farm_name, u.email AS seller_email,
                SUBSTRING_INDEX(u.email, '@', 1) AS seller_name
         FROM market_listings ml
         JOIN farms f ON f.id = ml.farm_id
         JOIN users u ON u.id = ml.seller_user_id
         WHERE ml.status = 'active' ${whereSql}
         ORDER BY ml.created_at DESC
         LIMIT 100`,
        params
    );
    return rows.map(row => decorateListing({
        ...row,
        seller_name: row.seller_name || publicSellerName(row.seller_email)
    }));
}

function parseOrderItems(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        return JSON.parse(value);
    } catch {
        return [];
    }
}

function isoDate(value) {
    return value ? new Date(value).toISOString() : null;
}

function orderFromRow(row) {
    return {
        id: Number(row.id),
        weekId: row.week_id,
        slotIndex: Number(row.slot_index),
        status: row.status,
        items: parseOrderItems(row.items_json),
        rewardCoins: Number(row.reward_coins) || 0,
        rewardXp: Number(row.reward_xp) || 0,
        weeklyPoints: Number(row.weekly_points) || 0,
        generatedAt: isoDate(row.generated_at),
        cooldownUntil: isoDate(row.cooldown_until)
    };
}

function makeOrderFields(userId, weekId, slotIndex, level, now = new Date()) {
    return {
        ...generateOrder({
            userId,
            weekId,
            slotIndex,
            level,
            entropy: `${Date.now()}:${Math.random()}`
        }),
        generatedAt: now
    };
}

async function insertOrderRow(conn, userId, weekId, slotIndex, level, now = new Date()) {
    const order = makeOrderFields(userId, weekId, slotIndex, level, now);
    await conn.query(
        `INSERT INTO delivery_orders
         (user_id, week_id, slot_index, status, items_json, reward_coins, reward_xp, weekly_points, generated_at, cooldown_until)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL)`,
        [
            userId,
            weekId,
            slotIndex,
            JSON.stringify(order.items),
            order.rewardCoins,
            order.rewardXp,
            order.weeklyPoints,
            order.generatedAt
        ]
    );
}

async function replaceOrderRow(conn, row, userId, weekId, slotIndex, level, now = new Date()) {
    const order = makeOrderFields(userId, weekId, slotIndex, level, now);
    await conn.query(
        `UPDATE delivery_orders
         SET status = 'active',
             items_json = ?,
             reward_coins = ?,
             reward_xp = ?,
             weekly_points = ?,
             generated_at = ?,
             cooldown_until = NULL
         WHERE id = ?`,
        [
            JSON.stringify(order.items),
            order.rewardCoins,
            order.rewardXp,
            order.weeklyPoints,
            order.generatedAt,
            row.id
        ]
    );
}

async function ensureCurrentOrders(conn, userId, now = new Date()) {
    const weekInfo = getWeekInfo(now);
    const canonical = await getCanonicalState(conn, userId);
    const playerLevel = Number(canonical?.state?.level) || 1;
    const [rows] = await conn.query(
        'SELECT * FROM delivery_orders WHERE user_id = ? AND week_id = ? FOR UPDATE',
        [userId, weekInfo.weekId]
    );
    const bySlot = new Map(rows.map(row => [Number(row.slot_index), row]));

    for (let slotIndex = 0; slotIndex < getOrderSlotCount(); slotIndex += 1) {
        const row = bySlot.get(slotIndex);
        if (!row) {
            await insertOrderRow(conn, userId, weekInfo.weekId, slotIndex, playerLevel, now);
            continue;
        }
        if (row.status === 'trashed' && getCooldownRemainingMs(row.cooldown_until, now) === 0) {
            await replaceOrderRow(conn, row, userId, weekInfo.weekId, slotIndex, playerLevel, now);
        }
    }

    const [freshRows] = await conn.query(
        'SELECT * FROM delivery_orders WHERE user_id = ? AND week_id = ? AND slot_index < ? ORDER BY slot_index ASC',
        [userId, weekInfo.weekId, getOrderSlotCount()]
    );

    return {
        weekInfo,
        orders: freshRows.map(orderFromRow)
    };
}

async function getWeeklyStatus(conn, userId, weekInfo, now = new Date()) {
    const [[scoreRow]] = await conn.query(
        'SELECT points, deliveries FROM weekly_scores WHERE user_id = ? AND week_id = ?',
        [userId, weekInfo.weekId]
    );
    const [claimRows] = await conn.query(
        `SELECT reward_id FROM weekly_reward_claims
         WHERE user_id = ? AND week_id = ? AND reward_type = 'milestone'`,
        [userId, weekInfo.weekId]
    );
    const points = Number(scoreRow?.points || 0);

    return {
        weekId: weekInfo.weekId,
        startsAt: weekInfo.startsAt,
        endsAt: weekInfo.endsAt,
        serverNow: now.toISOString(),
        score: {
            points,
            deliveries: Number(scoreRow?.deliveries || 0)
        },
        milestones: decorateMilestones(points, claimRows.map(row => row.reward_id))
    };
}

async function getDeliveryBoard(conn, userId, now = new Date()) {
    const board = await ensureCurrentOrders(conn, userId, now);
    const weekly = await getWeeklyStatus(conn, userId, board.weekInfo, now);
    return {
        orders: board.orders,
        weekly
    };
}

async function getRankInfo(conn, userId, weekId) {
    const [[scoreRow]] = await conn.query(
        'SELECT points, deliveries FROM weekly_scores WHERE user_id = ? AND week_id = ?',
        [userId, weekId]
    );
    const points = Number(scoreRow?.points || 0);
    if (!scoreRow || points <= 0) return null;

    const [[rankRow]] = await conn.query(
        'SELECT COUNT(*) AS better_count FROM weekly_scores WHERE week_id = ? AND points > ?',
        [weekId, points]
    );

    return {
        rank: Number(rankRow?.better_count || 0) + 1,
        points,
        deliveries: Number(scoreRow.deliveries || 0)
    };
}

async function getPreviousRankRewardStatus(conn, userId, now = new Date()) {
    const previousWeek = getPreviousWeekInfo(now);
    const rankInfo = await getRankInfo(conn, userId, previousWeek.weekId);
    if (!rankInfo) {
        return {
            weekId: previousWeek.weekId,
            rank: null,
            points: 0,
            deliveries: 0,
            reward: null,
            claimable: false,
            claimed: false
        };
    }

    const rankReward = getRankReward(rankInfo.rank);
    const [[claimRow]] = await conn.query(
        `SELECT reward_id FROM weekly_reward_claims
         WHERE user_id = ? AND week_id = ? AND reward_type = 'rank' AND reward_id = 'rank'`,
        [userId, previousWeek.weekId]
    );

    return {
        weekId: previousWeek.weekId,
        ...rankInfo,
        reward: rankReward,
        claimable: Boolean(rankReward) && !claimRow,
        claimed: Boolean(claimRow)
    };
}

function assertSufficientItems(state, order) {
    for (const item of order.items) {
        const available = Number(state.inventory?.[item.category]?.[item.itemId] || 0);
        if (available < Number(item.quantity)) {
            const err = new Error('Không đủ nông sản để giao đơn này');
            err.status = 400;
            throw err;
        }
    }
}

function deductOrderItems(state, order) {
    order.items.forEach(item => {
        state.inventory[item.category][item.itemId] =
            Number(state.inventory[item.category][item.itemId] || 0) - Number(item.quantity);
    });
}

app.get('/api/health', async (_req, res) => {
    res.json({ ok: true });
});

app.get('/api/game-config', authRequired, async (_req, res) => {
    const config = await getGameConfig(pool);
    const shopProducts = await getPublicProducts(pool);
    const [events] = getSettingValue('ENABLE_EVENT', true) ? await pool.query(`SELECT id,name,banner_url,starts_at,ends_at,reward_json,condition_json
        FROM game_events WHERE is_active=1 AND starts_at<=NOW() AND ends_at>=NOW() ORDER BY starts_at`)
        : [[]];
    res.json({ ...config, settings: getSettingsObject({ publicOnly: true }), shopProducts, events });
});

app.post('/api/auth/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const farmName = String(req.body.farmName || 'Happy Farm').trim().slice(0, 64) || 'Happy Farm';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email is invalid' });
    }
    const passwordError = validatePassword(password, 'Mật khẩu', getSettingValue('PASSWORD_MIN_LENGTH', 6));
    if (passwordError) return res.status(400).json({ error: passwordError });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const passwordHash = await bcrypt.hash(password, 12);
        const [userResult] = await conn.query(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)',
            [email, passwordHash]
        );
        const user = { id: userResult.insertId, email };
        const starter = await createPlayerState(conn, user.id, farmName, getSettingsObject());
        const [farmResult] = await conn.query(
            'INSERT INTO farms (user_id, name, coins, gems) VALUES (?, ?, ?, ?)',
            [user.id, starter.farmName, starter.coins, starter.gems]
        );
        const farm = { id: farmResult.insertId, name: starter.farmName };

        await conn.commit();
        res.status(201).json({
            token: signToken(user, farm),
            profile: profileFromRows(user, farm)
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email already registered' });
        }
        console.error(err);
        res.status(500).json({ error: 'Could not register account' });
    } finally {
        conn.release();
    }
});

app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        if (user && user.role === 'player') {
            const nextAttempts = Number(user.failed_login_attempts || 0) + 1;
            const shouldLock = nextAttempts >= Number(getSettingValue('MAX_LOGIN_FAIL', 5));
            await pool.query('UPDATE users SET failed_login_attempts = ?, status = IF(?, \'locked\', status) WHERE id = ?', [nextAttempts, shouldLock, user.id]);
        }
        return res.status(401).json({ error: 'Email or password is incorrect' });
    }
    if (user.status === 'locked') return res.status(423).json({ error: 'Tài khoản đã bị khóa.' });
    if (user.role === 'admin') return res.status(403).json({ error: 'Admin phải đăng nhập tại trang quản trị.' });

    const [[farm]] = await pool.query('SELECT * FROM farms WHERE user_id = ?', [user.id]);
    if (!farm) {
        return res.status(500).json({ error: 'Account has no farm' });
    }

    await pool.query('UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0 WHERE id = ?', [user.id]);
    await writeAuditLog(pool, { userId: user.id, actorRole: 'player', action: 'player_login', entityType: 'user', entityId: user.id, ipAddress: requestIp(req) });
    res.json({
        token: signToken(user, farm),
        profile: profileFromRows(user, farm)
    });
});

app.get('/api/me/profile', authRequired, async (req, res) => {
    const [[user]] = await pool.query(
        'SELECT id, email, created_at FROM users WHERE id = ?',
        [req.user.id]
    );
    const [[farm]] = await pool.query('SELECT * FROM farms WHERE user_id = ?', [req.user.id]);
    if (!user || !farm) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

    res.json({
        profile: {
            ...profileFromRows(user, farm),
            createdAt: user.created_at
        }
    });
});

app.put('/api/me/profile', authRequired, async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const farmName = normalizeFarmName(req.body.farmName);
    const validationError = validateEmail(email) || validateFarmName(farmName);
    if (validationError) return res.status(400).json({ error: validationError });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[user]] = await conn.query(
            'SELECT id, email, created_at FROM users WHERE id = ? FOR UPDATE',
            [req.user.id]
        );
        const farm = await getFarmForUser(conn, req.user.id);
        if (!user || !farm) {
            await conn.rollback();
            return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        }

        await conn.query('UPDATE users SET email = ? WHERE id = ?', [email, req.user.id]);
        await conn.query('UPDATE farms SET name = ? WHERE user_id = ?', [farmName, req.user.id]);
        const canonical = await getCanonicalState(conn, req.user.id);
        const updatedUser = { ...user, email };
        const updatedFarm = { ...canonical.farm, name: farmName };
        await conn.commit();

        res.json({
            token: signToken(updatedUser, updatedFarm),
            profile: {
                ...profileFromRows(updatedUser, updatedFarm),
                createdAt: user.created_at
            },
            state: canonical.state
        });
    } catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email này đã được sử dụng.' });
        }
        console.error(err);
        res.status(500).json({ error: 'Không cập nhật được thông tin cá nhân.' });
    } finally {
        conn.release();
    }
});

app.put('/api/me/password', authRequired, async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const validationError = validatePassword(newPassword, 'Mật khẩu mới', getSettingValue('PASSWORD_MIN_LENGTH', 6));
    if (validationError) return res.status(400).json({ error: validationError });
    if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
    }

    const [[user]] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
    res.json({ ok: true, message: 'Đổi mật khẩu thành công.' });
});

app.get('/api/me/state', authRequired, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const canonical = await getCanonicalState(conn, req.user.id);
        const farm = canonical.farm;
        res.json({
            profile: profileFromRows(req.user, farm),
            importedLocalSave: Boolean(farm.imported_local_save),
            state: canonical.state
        });
    } finally {
        conn.release();
    }
});

app.put('/api/me/state', authRequired, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const before = await getCanonicalState(conn, req.user.id);
        const state = await savePlayerState(conn, req.user.id, req.body.state || req.body);
        const harvestedBefore = Number(before?.state?.stats?.harvestedTotal || 0);
        const harvestedAfter = Number(state?.stats?.harvestedTotal || 0);
        if (harvestedAfter > harvestedBefore) {
            await writeAuditLog(conn, { userId: req.user.id, actorRole: 'player', action: 'harvest', entityType: 'farm', entityId: before?.farm?.id, details: { amount: harvestedAfter - harvestedBefore }, ipAddress: requestIp(req) });
        }
        if (Number(state.level) > Number(before?.state?.level || 1)) {
            await writeAuditLog(conn, { userId: req.user.id, actorRole: 'player', action: 'level_up', entityType: 'user', entityId: req.user.id, details: { from: before.state.level, to: state.level }, ipAddress: requestIp(req) });
        }
        await conn.commit();
        res.json({ state });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Could not save game state' });
    } finally {
        conn.release();
    }
});

app.post('/api/me/import-local-save', authRequired, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const farm = await getFarmForUser(conn, req.user.id);
        if (!farm) {
            await conn.rollback();
            return res.status(404).json({ error: 'Farm not found' });
        }
        if (farm.imported_local_save) {
            await conn.rollback();
            return res.status(409).json({ error: 'Local save has already been imported' });
        }
        const state = await savePlayerState(conn, req.user.id, req.body.state || req.body, true);
        await conn.commit();
        res.json({ state });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Could not import local save' });
    } finally {
        conn.release();
    }
});

app.get('/api/orders', authRequired, async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const board = await getDeliveryBoard(conn, req.user.id);
        await conn.commit();
        res.json(board);
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Không tải được bảng đơn hàng' });
    } finally {
        conn.release();
    }
});

app.post('/api/orders/:orderId/deliver', authRequired, async (req, res) => {
    const orderId = Number.parseInt(req.params.orderId, 10);
    const now = new Date();
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        const board = await ensureCurrentOrders(conn, req.user.id, now);
        const order = board.orders.find(item => Number(item.id) === orderId);
        if (!order || order.status !== 'active') {
            await conn.rollback();
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng đang hoạt động' });
        }

        const itemIds = order.items.map(item => item.itemId);
        if (itemIds.length > 0) {
            const placeholders = itemIds.map(() => '?').join(', ');
            await conn.query(
                `SELECT item_id, quantity FROM inventory_items
                 WHERE user_id = ? AND category = 'crops' AND item_id IN (${placeholders})
                 FOR UPDATE`,
                [req.user.id, ...itemIds]
            );
        }

        const canonical = await getCanonicalState(conn, req.user.id);
        const state = canonical.state;
        assertSufficientItems(state, order);
        deductOrderItems(state, order);
        applyRewardToState(state, {
            coins: order.rewardCoins,
            xp: order.rewardXp
        });

        await conn.query(
            `INSERT INTO weekly_scores (user_id, week_id, points, deliveries)
             VALUES (?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                points = points + VALUES(points),
                deliveries = deliveries + 1`,
            [req.user.id, board.weekInfo.weekId, order.weeklyPoints]
        );

        const savedState = await savePlayerState(conn, req.user.id, state);
        await replaceOrderRow(
            conn,
            { id: order.id },
            req.user.id,
            board.weekInfo.weekId,
            order.slotIndex,
            savedState.level,
            now
        );
        const refreshed = await getDeliveryBoard(conn, req.user.id, now);
        await writeAuditLog(conn, { userId: req.user.id, actorRole: 'player', action: 'delivery', entityType: 'delivery_order', entityId: order.id, details: { rewardCoins: order.rewardCoins, rewardXp: order.rewardXp, weeklyPoints: order.weeklyPoints }, ipAddress: requestIp(req) });

        await conn.commit();
        res.json({
            state: savedState,
            orders: refreshed.orders,
            weekly: refreshed.weekly,
            delivered: {
                rewardCoins: order.rewardCoins,
                rewardXp: order.rewardXp,
                weeklyPoints: order.weeklyPoints
            }
        });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(err.status || 500).json({ error: err.message || 'Không giao được đơn hàng' });
    } finally {
        conn.release();
    }
});

app.post('/api/orders/:orderId/trash', authRequired, async (req, res) => {
    const orderId = Number.parseInt(req.params.orderId, 10);
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + TRASH_COOLDOWN_MS);
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        const board = await ensureCurrentOrders(conn, req.user.id, now);
        const order = board.orders.find(item => Number(item.id) === orderId);
        if (!order || order.status !== 'active') {
            await conn.rollback();
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng đang hoạt động' });
        }

        await conn.query(
            `UPDATE delivery_orders
             SET status = 'trashed', cooldown_until = ?
             WHERE id = ? AND user_id = ?`,
            [cooldownUntil, order.id, req.user.id]
        );
        const refreshed = await getDeliveryBoard(conn, req.user.id, now);

        await conn.commit();
        res.json(refreshed);
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Không hủy được đơn hàng' });
    } finally {
        conn.release();
    }
});

app.post('/api/weekly/milestones/:milestoneId/claim', authRequired, async (req, res) => {
    const milestoneId = String(req.params.milestoneId || '');
    const now = new Date();
    const weekInfo = getWeekInfo(now);
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        const [[scoreRow]] = await conn.query(
            'SELECT points, deliveries FROM weekly_scores WHERE user_id = ? AND week_id = ? FOR UPDATE',
            [req.user.id, weekInfo.weekId]
        );
        const [claimRows] = await conn.query(
            `SELECT reward_id FROM weekly_reward_claims
             WHERE user_id = ? AND week_id = ? AND reward_type = 'milestone'
             FOR UPDATE`,
            [req.user.id, weekInfo.weekId]
        );
        const points = Number(scoreRow?.points || 0);
        const milestone = decorateMilestones(points, claimRows.map(row => row.reward_id))
            .find(item => item.id === milestoneId);

        if (!milestone || !milestone.claimable) {
            await conn.rollback();
            return res.status(400).json({ error: 'Mốc thưởng tuần này chưa thể nhận' });
        }

        const canonical = await getCanonicalState(conn, req.user.id);
        applyRewardToState(canonical.state, milestone.reward);
        const state = await savePlayerState(conn, req.user.id, canonical.state);
        await conn.query(
            `INSERT INTO weekly_reward_claims (user_id, week_id, reward_type, reward_id)
             VALUES (?, ?, 'milestone', ?)`,
            [req.user.id, weekInfo.weekId, milestone.id]
        );
        const weekly = await getWeeklyStatus(conn, req.user.id, weekInfo, now);

        await conn.commit();
        res.json({ state, weekly });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Không nhận được mốc thưởng tuần' });
    } finally {
        conn.release();
    }
});

app.get('/api/leaderboard/weekly', authRequired, async (req, res) => {
    const now = new Date();
    const weekInfo = getWeekInfo(now);

    const [rows] = await pool.query(
        `SELECT ws.user_id, ws.week_id, ws.points, ws.deliveries, ws.updated_at,
                f.id AS farm_id, f.name AS farm_name, u.email
         FROM weekly_scores ws
         JOIN farms f ON f.user_id = ws.user_id
         JOIN users u ON u.id = ws.user_id
         WHERE ws.week_id = ?
         ORDER BY ws.points DESC, ws.deliveries DESC, ws.updated_at ASC
         LIMIT 20`,
        [weekInfo.weekId]
    );

    const top = rows.map((row, index) => ({
        rank: index + 1,
        userId: Number(row.user_id),
        farmId: Number(row.farm_id),
        farmName: row.farm_name,
        ownerName: publicSellerName(row.email),
        points: Number(row.points || 0),
        deliveries: Number(row.deliveries || 0),
        isMine: Number(row.user_id) === Number(req.user.id)
    }));

    const conn = await pool.getConnection();
    try {
        const me = await getRankInfo(conn, req.user.id, weekInfo.weekId);
        const previousReward = await getPreviousRankRewardStatus(conn, req.user.id, now);
        res.json({
            weekly: {
                weekId: weekInfo.weekId,
                startsAt: weekInfo.startsAt,
                endsAt: weekInfo.endsAt,
                serverNow: now.toISOString(),
                top,
                me
            },
            previousReward
        });
    } finally {
        conn.release();
    }
});

app.get('/api/leaderboard/levels', authRequired, async (req, res) => {
    const [rows] = await pool.query(
        `SELECT u.id AS user_id, u.email, f.id AS farm_id, f.name AS farm_name, ps.state_json
         FROM users u
         JOIN farms f ON f.user_id = u.id
         JOIN player_state ps ON ps.user_id = u.id`
    );
    const leaderboard = buildLevelLeaderboard(
        rows.map(row => ({
            ...row,
            ownerName: publicSellerName(row.email)
        })),
        req.user.id,
        Number(getSettingValue('LEADERBOARD_SIZE', 20))
    );
    res.json({ leaderboard });
});

app.post('/api/leaderboard/weekly/claim-rank-reward', authRequired, async (req, res) => {
    const now = new Date();
    const previousWeek = getPreviousWeekInfo(now);
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        const rankInfo = await getRankInfo(conn, req.user.id, previousWeek.weekId);
        const rankReward = rankInfo ? getRankReward(rankInfo.rank) : null;
        if (!rankInfo || !rankReward) {
            await conn.rollback();
            return res.status(400).json({ error: 'Không có thưởng xếp hạng tuần trước' });
        }

        const [[claimRow]] = await conn.query(
            `SELECT reward_id FROM weekly_reward_claims
             WHERE user_id = ? AND week_id = ? AND reward_type = 'rank' AND reward_id = 'rank'
             FOR UPDATE`,
            [req.user.id, previousWeek.weekId]
        );
        if (claimRow) {
            await conn.rollback();
            return res.status(409).json({ error: 'Thưởng xếp hạng tuần trước đã được nhận' });
        }

        const canonical = await getCanonicalState(conn, req.user.id);
        applyRewardToState(canonical.state, rankReward.reward);
        const state = await savePlayerState(conn, req.user.id, canonical.state);
        await conn.query(
            `INSERT INTO weekly_reward_claims (user_id, week_id, reward_type, reward_id)
             VALUES (?, ?, 'rank', 'rank')`,
            [req.user.id, previousWeek.weekId]
        );
        const previousReward = await getPreviousRankRewardStatus(conn, req.user.id, now);

        await conn.commit();
        res.json({ state, previousReward });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Không nhận được thưởng xếp hạng tuần trước' });
    } finally {
        conn.release();
    }
});

app.post('/api/shop/purchase', authRequired, async (req, res) => {
    const productId = Math.max(0, Number.parseInt(req.body.productId, 10) || 0);
    const quantity = Math.max(0, Number.parseInt(req.body.quantity, 10) || 0);
    if (!productId || quantity < 1 || quantity > 10000) return res.status(400).json({ error: 'Sản phẩm hoặc số lượng không hợp lệ.' });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [[row]] = await conn.query(`${SHOP_SELECT} WHERE sp.id=? FOR UPDATE`, [productId]);
        if (!row || !row.is_active || row.status !== 'selling') {
            await conn.rollback(); return res.status(404).json({ error: 'Sản phẩm hiện không được bán.' });
        }
        const config = row.config_json && typeof row.config_json === 'object' ? row.config_json : JSON.parse(row.config_json || '{}');
        const inventoryCategory = row.entity_type === 'seed' ? 'seeds' : (row.entity_type === 'item' ? config.category : null);
        if (!inventoryCategory || !getItemMeta(inventoryCategory, row.code)) {
            await conn.rollback(); return res.status(400).json({ error: 'Loại sản phẩm này chưa được gameplay hỗ trợ.' });
        }
        if (inventoryCategory === 'buildings' && quantity !== 1) {
            await conn.rollback(); return res.status(400).json({ error: 'Mỗi nông trại chỉ được mua một máy.' });
        }
        const canonical = await getCanonicalState(conn, req.user.id);
        if (inventoryCategory === 'buildings' && Number(canonical.state.inventory?.buildings?.[row.code] || 0) > 0) {
            await conn.rollback(); return res.status(409).json({ error: 'Bạn đã sở hữu máy này.' });
        }
        if (Number(canonical.state.level || 1) < Number(row.unlock_level || 1)) {
            await conn.rollback(); return res.status(400).json({ error: `Cần đạt cấp ${row.unlock_level} để mua sản phẩm này.` });
        }
        const [[storage]] = await conn.query('SELECT COALESCE(SUM(quantity),0) total FROM inventory_items WHERE user_id=? FOR UPDATE', [req.user.id]);
        if (Number(storage.total) + quantity > Number(getSettingValue('MAX_STORAGE', 999999))) {
            await conn.rollback(); return res.status(400).json({ error: 'Kho đồ đã đạt giới hạn.' });
        }
        const now = new Date();
        const pricing = effectivePrice(row, now);
        const unitPrice = Math.max(0, Math.round((pricing.flashActive || getSettingValue('ENABLE_DISCOUNT', true) ? pricing.price : Number(row.buy_price)) * Number(getSettingValue('BUY_RATE', 1))));
        const totalPrice = unitPrice * quantity;
        const [[farm]] = await conn.query('SELECT coins FROM farms WHERE user_id=? FOR UPDATE', [req.user.id]);
        if (Number(farm.coins) < totalPrice) { await conn.rollback(); return res.status(400).json({ error: 'Không đủ tiền vàng.' }); }

        const dailyKey = `daily:${purchasePeriodKey('daily', now)}`;
        const [[dailyTotal]] = await conn.query('SELECT COALESCE(SUM(quantity),0) quantity FROM shop_purchases WHERE user_id=? AND period_key=?', [req.user.id, dailyKey]);
        const globalDailyLimit = Number(getSettingValue('MAX_ITEM_PER_DAY', 0));
        if (globalDailyLimit > 0 && Number(dailyTotal.quantity) + quantity > globalDailyLimit) {
            await conn.rollback(); return res.status(400).json({ error: `Mỗi ngày chỉ được mua tối đa ${globalDailyLimit} vật phẩm.` });
        }
        let limitKey = null;
        if (row.purchase_limit_type !== 'none') {
            limitKey = row.purchase_limit_type === 'daily' ? dailyKey : `${row.purchase_limit_type}:${purchasePeriodKey(row.purchase_limit_type, now)}`;
            const [[bought]] = await conn.query('SELECT quantity FROM shop_purchases WHERE user_id=? AND shop_product_id=? AND period_key=? FOR UPDATE', [req.user.id, productId, limitKey]);
            if (Number(bought?.quantity || 0) + quantity > Number(row.purchase_limit)) {
                await conn.rollback(); return res.status(400).json({ error: `Sản phẩm giới hạn ${row.purchase_limit} mỗi ${row.purchase_limit_type}.` });
            }
        }
        if (pricing.flashActive && row.flash_stock_limit != null && Number(row.flash_sold_count) + quantity > Number(row.flash_stock_limit)) {
            await conn.rollback(); return res.status(409).json({ error: 'Số lượng Flash Sale không còn đủ.' });
        }

        await conn.query('UPDATE farms SET coins=coins-? WHERE user_id=?', [totalPrice, req.user.id]);
        await addInventoryItem(conn, req.user.id, inventoryCategory, row.code, quantity);
        const purchaseKeys = new Set([dailyKey, limitKey].filter(Boolean));
        for (const periodKey of purchaseKeys) {
            await conn.query(`INSERT INTO shop_purchases (user_id,shop_product_id,period_key,quantity,total_spent)
                VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity),total_spent=total_spent+VALUES(total_spent)`,
            [req.user.id, productId, periodKey, quantity, totalPrice]);
        }
        if (pricing.flashActive) await conn.query('UPDATE shop_products SET flash_sold_count=flash_sold_count+? WHERE id=?', [quantity, productId]);
        const updated = await getCanonicalState(conn, req.user.id);
        await writeAuditLog(conn, { userId: req.user.id, actorRole: 'player', action: 'shop_buy', entityType: 'shop_product', entityId: productId, details: { itemId: row.code, category: inventoryCategory, quantity, unitPrice, totalPrice, flashSale: pricing.flashActive }, ipAddress: requestIp(req) });
        await conn.commit();
        invalidateShopCache();
        res.json({ ok: true, state: updated.state, purchase: { productId, quantity, unitPrice, totalPrice } });
    } catch (error) {
        await conn.rollback(); console.error(error); res.status(500).json({ error: 'Không thể mua sản phẩm.' });
    } finally { conn.release(); }
});

app.get('/api/market', authRequired, async (req, res) => {
    const filters = [];
    const params = [];

    if (req.query.category) {
        filters.push('AND ml.category = ?');
        params.push(String(req.query.category));
    }
    if (req.query.itemId) {
        filters.push('AND ml.item_id = ?');
        params.push(String(req.query.itemId));
    }
    if (req.query.search) {
        filters.push('AND (LOWER(ml.item_id) LIKE ? OR LOWER(f.name) LIKE ?)');
        const like = `%${String(req.query.search).toLowerCase()}%`;
        params.push(like, like);
    }

    const listings = await getActiveListings(` ${filters.join(' ')}`, params);
    res.json({ listings });
});

app.post('/api/market/listings', authRequired, async (req, res) => {
    const category = String(req.body.category || '');
    const itemId = String(req.body.itemId || '');
    const quantity = Math.max(0, Number.parseInt(req.body.quantity, 10) || 0);
    const priceEach = Math.max(0, Number.parseInt(req.body.priceEach, 10) || 0);
    if (category === 'buildings') return res.status(400).json({ error: 'Công trình không thể rao bán.' });
    const meta = getItemMeta(category, itemId);

    if (!meta) return res.status(400).json({ error: 'Unknown item' });
    if (quantity < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
    if (priceEach < meta.minPrice || priceEach > meta.maxPrice) {
        return res.status(400).json({ error: `Price must be from ${meta.minPrice} to ${meta.maxPrice}` });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const farm = await getFarmForUser(conn, req.user.id);
        const [[slotCount]] = await conn.query(
            'SELECT COUNT(*) AS count FROM market_listings WHERE seller_user_id = ? AND status = ?',
            [req.user.id, 'active']
        );
        if (Number(slotCount.count) >= STALL_SLOT_LIMIT) {
            await conn.rollback();
            return res.status(400).json({ error: 'Your stall is full' });
        }

        const [[inventoryRow]] = await conn.query(
            'SELECT quantity FROM inventory_items WHERE user_id = ? AND category = ? AND item_id = ? FOR UPDATE',
            [req.user.id, category, itemId]
        );
        const available = Number(inventoryRow?.quantity || 0);
        if (available < quantity) {
            await conn.rollback();
            return res.status(400).json({ error: 'Not enough items in inventory' });
        }

        await setInventoryQuantity(conn, req.user.id, category, itemId, available - quantity);
        const [result] = await conn.query(
            `INSERT INTO market_listings
             (seller_user_id, farm_id, category, item_id, quantity, price_each)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, farm.id, category, itemId, quantity, priceEach]
        );
        const canonical = await getCanonicalState(conn, req.user.id);
        await writeAuditLog(conn, { userId: req.user.id, actorRole: 'player', action: 'market_list', entityType: 'market_listing', entityId: result.insertId, details: { category, itemId, quantity, priceEach }, ipAddress: requestIp(req) });
        await conn.commit();

        res.status(201).json({
            listingId: Number(result.insertId),
            state: canonical.state
        });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Could not create listing' });
    } finally {
        conn.release();
    }
});

app.delete('/api/market/listings/:id', authRequired, async (req, res) => {
    const listingId = Number.parseInt(req.params.id, 10);
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        const [[listing]] = await conn.query(
            'SELECT * FROM market_listings WHERE id = ? FOR UPDATE',
            [listingId]
        );
        if (!listing || listing.status !== 'active' || Number(listing.seller_user_id) !== Number(req.user.id)) {
            await conn.rollback();
            return res.status(404).json({ error: 'Active listing not found' });
        }

        await conn.query('UPDATE market_listings SET status = ? WHERE id = ?', ['cancelled', listingId]);
        await addInventoryItem(conn, req.user.id, listing.category, listing.item_id, Number(listing.quantity));
        const canonical = await getCanonicalState(conn, req.user.id);
        await conn.commit();
        res.json({ state: canonical.state });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Could not cancel listing' });
    } finally {
        conn.release();
    }
});

app.post('/api/market/listings/:id/buy', authRequired, async (req, res) => {
    const listingId = Number.parseInt(req.params.id, 10);
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();
        const [[listing]] = await conn.query(
            'SELECT * FROM market_listings WHERE id = ? FOR UPDATE',
            [listingId]
        );
        if (!listing || listing.status !== 'active') {
            await conn.rollback();
            return res.status(409).json({ error: 'Món hàng đã bán' });
        }
        if (Number(listing.seller_user_id) === Number(req.user.id)) {
            await conn.rollback();
            return res.status(400).json({ error: 'You cannot buy your own listing' });
        }

        const totalPrice = Number(listing.quantity) * Number(listing.price_each);
        const [[buyerFarm]] = await conn.query('SELECT * FROM farms WHERE user_id = ? FOR UPDATE', [req.user.id]);
        const [[sellerFarm]] = await conn.query('SELECT * FROM farms WHERE user_id = ? FOR UPDATE', [listing.seller_user_id]);

        if (Number(buyerFarm.coins) < totalPrice) {
            await conn.rollback();
            return res.status(400).json({ error: 'Not enough coins' });
        }

        await conn.query('UPDATE farms SET coins = coins - ? WHERE user_id = ?', [totalPrice, req.user.id]);
        await conn.query('UPDATE farms SET coins = LEAST(?, coins + ?) WHERE user_id = ?', [Number(getSettingValue('MAX_GOLD', 2147483647)), totalPrice, listing.seller_user_id]);
        await addInventoryItem(conn, req.user.id, listing.category, listing.item_id, Number(listing.quantity));
        await conn.query('UPDATE market_listings SET status = ? WHERE id = ?', ['sold', listingId]);
        await conn.query(
            `INSERT INTO market_transactions
             (listing_id, buyer_user_id, seller_user_id, category, item_id, quantity, total_price)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [listingId, req.user.id, listing.seller_user_id, listing.category, listing.item_id, listing.quantity, totalPrice]
        );

        const buyerCanonical = await getCanonicalState(conn, req.user.id);
        await getCanonicalState(conn, listing.seller_user_id);
        await writeAuditLog(conn, { userId: req.user.id, actorRole: 'player', action: 'market_buy', entityType: 'market_listing', entityId: listingId, details: { sellerUserId: Number(listing.seller_user_id), category: listing.category, itemId: listing.item_id, quantity: Number(listing.quantity), totalPrice }, ipAddress: requestIp(req) });
        await conn.commit();
        res.json({ state: buyerCanonical.state });
    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: 'Could not buy listing' });
    } finally {
        conn.release();
    }
});

app.get('/api/farms/:farmId', authRequired, async (req, res) => {
    const farmId = Number.parseInt(req.params.farmId, 10);
    const [[farm]] = await pool.query(
        `SELECT f.*, u.email
         FROM farms f
         JOIN users u ON u.id = f.user_id
         WHERE f.id = ?`,
        [farmId]
    );
    if (!farm) return res.status(404).json({ error: 'Farm not found' });

    const conn = await pool.getConnection();
    try {
        const canonical = await getCanonicalState(conn, farm.user_id);
        const stall = await getActiveListings('AND ml.farm_id = ?', [farmId]);
        res.json({
            farm: {
                id: Number(farm.id),
                name: farm.name,
                ownerName: publicSellerName(farm.email),
                isMine: Number(farm.user_id) === Number(req.user.id)
            },
            state: canonical.state,
            stall
        });
    } finally {
        conn.release();
    }
});

app.get('/api/farms/:farmId/stall', authRequired, async (req, res) => {
    const farmId = Number.parseInt(req.params.farmId, 10);
    const stall = await getActiveListings('AND ml.farm_id = ?', [farmId]);
    res.json({ stall });
});

app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'admin.html'));
});

app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

initDb()
    .then(async () => {
        await ensureDefaultSystemSettings(pool);
        await ensureDefaultCatalog(pool);
        await ensureDefaultShop(pool);
        await refreshRuntimeConfig(pool);
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`Happy Farm server running on http://127.0.0.1:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Could not start server. Check MySQL settings and .env.');
        console.error(err);
        if (process.env.DISABLE_LOCAL_FALLBACK === 'true') {
            process.exit(1);
        }

        console.warn('Starting local fallback API because MySQL is unavailable.');
        const { startLocalFallbackServer } = require('./localFallback');
        startLocalFallbackServer({ port: PORT, jwtSecret: JWT_SECRET });
    });
