const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createAuthenticate, authorize } = require('./authMiddleware');
const { writeAuditLog, requestIp } = require('./auditLog');
const { normalizeCatalogPayload, normalizeEventPayload } = require('./adminRules');
const { getGameConfig, invalidateGameConfig, refreshRuntimeConfig, parseJson } = require('./gameConfigStore');
const { createSystemSettingsRouter } = require('./systemSettingsRouter');
const { getSettingValue } = require('./systemSettingsStore');
const { createShopRouter } = require('./shopRouter');
const { createDefaultState } = require('./defaultState');
const { getCanonicalState, savePlayerState } = require('./stateStore');

function number(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function safeState(value) {
    const state = parseJson(value);
    return state && typeof state === 'object' ? state : {};
}

function dateKey(value) {
    return new Date(value).toISOString().slice(0, 10);
}

function createAdminRouter({ pool, jwtSecret }) {
    const router = express.Router();
    const authenticate = createAuthenticate(pool, jwtSecret, { getSessionTimeoutMinutes: () => getSettingValue('SESSION_TIMEOUT', 10080) });

    router.post('/auth/login', async (req, res) => {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const [[user]] = await pool.query(
            'SELECT id, email, password_hash, role, status FROM users WHERE email = ?',
            [email]
        );
        if (!user || user.role !== 'admin' || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Thông tin đăng nhập Admin không hợp lệ.' });
        }
        if (user.status === 'locked') return res.status(423).json({ error: 'Tài khoản Admin đã bị khóa.' });
        await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
        await writeAuditLog(pool, { userId: user.id, actorRole: 'admin', action: 'admin_login', entityType: 'user', entityId: user.id, ipAddress: requestIp(req) });
        const token = jwt.sign({ sub: String(user.id), email: user.email, role: 'admin' }, jwtSecret, { expiresIn: `${getSettingValue('SESSION_TIMEOUT', 10080)}m` });
        res.json({ token, profile: { id: Number(user.id), email: user.email, role: 'admin' } });
    });

    router.use(authenticate, authorize('admin'));

    router.use('/system-settings', createSystemSettingsRouter({ pool, onRefresh: () => refreshRuntimeConfig(pool) }));
    router.use('/shop', createShopRouter({ pool, refreshCatalog: async () => {
        invalidateGameConfig();
        await refreshRuntimeConfig(pool);
    } }));

    router.get('/me', (req, res) => {
        res.json({ profile: { id: Number(req.user.id), email: req.user.email, role: req.user.role } });
    });

    router.post('/uploads', async (req, res) => {
        const match = String(req.body.dataUrl || '').match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i);
        if (!match) return res.status(400).json({ error: 'Chỉ hỗ trợ ảnh PNG, JPG hoặc WEBP.' });
        const buffer = Buffer.from(match[2], 'base64');
        const maxBytes = Number(getSettingValue('MAX_IMAGE_SIZE', 8)) * 1024 * 1024;
        const allowedTypes = new Set(String(getSettingValue('ALLOWED_IMAGE_TYPE', 'image/png,image/jpeg,image/webp')).split(',').map(type => type.trim()).filter(Boolean));
        if (!allowedTypes.has(match[1])) return res.status(400).json({ error: 'Định dạng ảnh không được hệ thống cho phép.' });
        if (!buffer.length || buffer.length > maxBytes) return res.status(400).json({ error: `Ảnh phải nhỏ hơn ${getSettingValue('MAX_IMAGE_SIZE', 8)} MB.` });
        const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[match[1]] || match[1].split('/')[1].replace(/[^a-z0-9]/g, '');
        const safeBase = path.basename(String(req.body.fileName || 'crop'), path.extname(String(req.body.fileName || '')))
            .toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 40) || 'crop';
        const fileName = `${safeBase}-${crypto.randomUUID()}.${extension}`;
        const uploadDir = path.join(__dirname, '..', 'uploads', 'admin');
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, fileName), buffer);
        const imageUrl = `/uploads/admin/${fileName}`;
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_upload_image', entityType: 'image', entityId: fileName, details: { imageUrl, bytes: buffer.length }, ipAddress: requestIp(req) });
        res.status(201).json({ imageUrl });
    });

    router.get('/dashboard', async (_req, res) => {
        const [[[counts]], [stateRows], [topRows], [dailyUsers], [loginRows], [[revenue]] ] = await Promise.all([
            pool.query(`SELECT
                (SELECT COUNT(*) FROM users WHERE role = 'player') AS total_players,
                (SELECT COUNT(*) FROM users WHERE role = 'player' AND DATE(created_at) = CURDATE()) AS new_today,
                (SELECT COUNT(*) FROM farms) AS total_farms,
                (SELECT COUNT(*) FROM delivery_orders) AS total_orders`),
            pool.query('SELECT state_json FROM player_state'),
            pool.query(`SELECT u.id, u.email, f.id AS farm_id, f.name AS farm_name, ps.state_json
                FROM users u JOIN farms f ON f.user_id = u.id JOIN player_state ps ON ps.user_id = u.id
                WHERE u.role = 'player' AND u.status = 'active'`),
            pool.query(`SELECT DATE(created_at) day, COUNT(*) total FROM users
                WHERE role = 'player' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
                GROUP BY DATE(created_at) ORDER BY day`),
            pool.query(`SELECT DATE(created_at) day, COUNT(*) total FROM system_logs
                WHERE action IN ('player_login','admin_login') AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
                GROUP BY DATE(created_at) ORDER BY day`),
            pool.query('SELECT COALESCE(SUM(total_price), 0) AS total FROM market_transactions')
        ]);
        let growingCrops = 0;
        let totalAnimals = 0;
        stateRows.forEach(row => {
            const state = safeState(row.state_json);
            growingCrops += (state.plots || []).filter(plot => plot && !['empty', 'mature'].includes(plot.state)).length;
            totalAnimals += Object.keys(state.animalProduction?.animals || {}).length;
        });
        const topPlayers = topRows.map(row => {
            const state = safeState(row.state_json);
            return { userId: Number(row.id), farmId: Number(row.farm_id), email: row.email, farmName: row.farm_name, level: number(state.level, 1), xp: number(state.xp) };
        }).sort((a, b) => b.level - a.level || b.xp - a.xp || a.userId - b.userId).slice(0, 10);
        res.json({
            summary: { totalPlayers: number(counts.total_players), newToday: number(counts.new_today), totalFarms: number(counts.total_farms), growingCrops, totalAnimals, totalOrders: number(counts.total_orders), revenue: number(revenue.total) },
            topPlayers,
            charts: {
                playersByDay: dailyUsers.map(row => ({ day: dateKey(row.day), total: number(row.total) })),
                loginsByDay: loginRows.map(row => ({ day: dateKey(row.day), total: number(row.total) }))
            }
        });
    });

    router.get('/players', async (req, res) => {
        const page = Math.max(1, number(req.query.page, 1));
        const limit = Math.min(100, Math.max(5, number(req.query.limit, 20)));
        const offset = (page - 1) * limit;
        const search = `%${String(req.query.search || '').trim()}%`;
        const status = ['active', 'locked'].includes(req.query.status) ? req.query.status : null;
        const orderMap = { created: 'u.created_at', level: 'level', coins: 'f.coins', name: 'f.name' };
        const orderBy = orderMap[req.query.sort] || 'u.created_at';
        const direction = String(req.query.direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const where = `u.role = 'player' AND (u.email LIKE ? OR f.name LIKE ?) ${status ? 'AND u.status = ?' : ''}`;
        const params = status ? [search, search, status] : [search, search];
        const [[countRow]] = await pool.query(`SELECT COUNT(*) total FROM users u JOIN farms f ON f.user_id = u.id WHERE ${where}`, params);
        const [rows] = await pool.query(
            `SELECT u.id, u.email, u.status, u.created_at, u.last_login_at, f.id farm_id, f.name farm_name, f.coins, f.gems,
                    COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(ps.state_json, '$.level')) AS UNSIGNED), 1) level
             FROM users u JOIN farms f ON f.user_id = u.id LEFT JOIN player_state ps ON ps.user_id = u.id
             WHERE ${where} ORDER BY ${orderBy} ${direction}, u.id ASC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        res.json({ players: rows.map(row => ({ ...row, id: Number(row.id), farm_id: Number(row.farm_id), coins: number(row.coins), gems: number(row.gems), level: number(row.level, 1) })), pagination: { page, limit, total: number(countRow.total) } });
    });

    router.get('/players/:id', async (req, res) => {
        const userId = number(req.params.id);
        const canonical = await getCanonicalState(pool, userId);
        const [[user]] = await pool.query('SELECT id, email, role, status, created_at, last_login_at FROM users WHERE id = ?', [userId]);
        if (!user || user.role !== 'player' || !canonical) return res.status(404).json({ error: 'Không tìm thấy người chơi.' });
        const [logs] = await pool.query('SELECT * FROM system_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [userId]);
        res.json({ player: { ...user, farm: canonical.farm, state: canonical.state }, activity: logs.map(row => ({ ...row, details: parseJson(row.details_json) })) });
    });

    router.patch('/players/:id/status', async (req, res) => {
        const userId = number(req.params.id);
        const status = req.body.status === 'locked' ? 'locked' : 'active';
        const [result] = await pool.query("UPDATE users SET status = ? WHERE id = ? AND role = 'player'", [status, userId]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy người chơi.' });
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: status === 'locked' ? 'admin_lock_player' : 'admin_unlock_player', entityType: 'user', entityId: userId, details: { targetUserId: userId }, ipAddress: requestIp(req) });
        res.json({ ok: true, status });
    });

    router.delete('/players/:id', async (req, res) => {
        const userId = number(req.params.id);
        const confirmEmail = String(req.body.confirmEmail || '').trim().toLowerCase();
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [[player]] = await conn.query(
                `SELECT u.id, u.email, u.role, f.id farm_id, f.name farm_name
                 FROM users u LEFT JOIN farms f ON f.user_id = u.id
                 WHERE u.id = ? FOR UPDATE`,
                [userId]
            );
            if (!player || player.role !== 'player') {
                await conn.rollback();
                return res.status(404).json({ error: 'Không tìm thấy người chơi.' });
            }
            if (!confirmEmail || confirmEmail !== String(player.email).toLowerCase()) {
                await conn.rollback();
                return res.status(400).json({ error: 'Email xác nhận không khớp.' });
            }

            await conn.query(
                'DELETE FROM market_transactions WHERE buyer_user_id = ? OR seller_user_id = ?',
                [userId, userId]
            );
            await conn.query('DELETE FROM users WHERE id = ? AND role = ?', [userId, 'player']);
            await writeAuditLog(conn, {
                userId: req.user.id,
                actorRole: 'admin',
                action: 'admin_delete_player',
                entityType: 'user',
                entityId: userId,
                details: { deletedEmail: player.email, deletedFarmId: Number(player.farm_id || 0), deletedFarmName: player.farm_name || null },
                ipAddress: requestIp(req)
            });
            await conn.commit();
            res.json({ ok: true, deletedUserId: userId });
        } catch (error) {
            await conn.rollback();
            console.error(error);
            res.status(500).json({ error: 'Không thể xóa tài khoản người chơi.' });
        } finally {
            conn.release();
        }
    });

    router.post('/players/:id/reset', async (req, res) => {
        const userId = number(req.params.id);
        const type = String(req.body.type || '');
        const canonical = await getCanonicalState(pool, userId);
        if (!canonical) return res.status(404).json({ error: 'Không tìm thấy người chơi.' });
        let state = canonical.state;
        if (type === 'money') { state.coins = 0; state.gems = 0; }
        else if (type === 'level') { state.level = 1; state.xp = 0; state.xpNeeded = 100; }
        else if (type === 'inventory') { state.inventory = createDefaultState(canonical.farm.name).inventory; }
        else if (type === 'farm') { state = createDefaultState(canonical.farm.name); }
        else return res.status(400).json({ error: 'Loại reset không hợp lệ.' });
        state = await savePlayerState(pool, userId, state);
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: `admin_reset_${type}`, entityType: 'user', entityId: userId, details: { targetUserId: userId }, ipAddress: requestIp(req) });
        res.json({ ok: true, state });
    });

    router.get('/catalog', async (req, res) => {
        const config = await getGameConfig(pool, { includeInactive: true, force: true });
        const type = String(req.query.type || '');
        res.json({ items: type ? config.catalog.filter(item => item.entityType === type) : config.catalog });
    });

    router.post('/catalog', async (req, res) => {
        try {
            const item = normalizeCatalogPayload(req.body);
            const [result] = await pool.query(
                `INSERT INTO game_catalog (entity_type, code, name, image_url, buy_price, sell_price, growth_seconds, xp_reward, unlock_level, config_json, is_active, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [item.entityType, item.code, item.name, item.imageUrl, item.buyPrice, item.sellPrice, item.growthSeconds, item.xpReward, item.unlockLevel, JSON.stringify(item.config), item.isActive ? 1 : 0, item.sortOrder]
            );
            invalidateGameConfig();
            await refreshRuntimeConfig(pool);
            await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_create_catalog', entityType: item.entityType, entityId: result.insertId, details: item, ipAddress: requestIp(req) });
            res.status(201).json({ id: Number(result.insertId), item });
        } catch (error) { res.status(400).json({ error: error.message }); }
    });

    router.put('/catalog/:id', async (req, res) => {
        try {
            const item = normalizeCatalogPayload(req.body);
            const [result] = await pool.query(
                `UPDATE game_catalog SET entity_type=?, code=?, name=?, image_url=?, buy_price=?, sell_price=?, growth_seconds=?, xp_reward=?, unlock_level=?, config_json=?, is_active=?, sort_order=? WHERE id=?`,
                [item.entityType, item.code, item.name, item.imageUrl, item.buyPrice, item.sellPrice, item.growthSeconds, item.xpReward, item.unlockLevel, JSON.stringify(item.config), item.isActive ? 1 : 0, item.sortOrder, number(req.params.id)]
            );
            if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy nội dung.' });
            invalidateGameConfig();
            await refreshRuntimeConfig(pool);
            await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_update_catalog', entityType: item.entityType, entityId: req.params.id, details: item, ipAddress: requestIp(req) });
            res.json({ ok: true, item });
        } catch (error) { res.status(400).json({ error: error.message }); }
    });

    router.delete('/catalog/:id', async (req, res) => {
        const [result] = await pool.query('DELETE FROM game_catalog WHERE id = ?', [number(req.params.id)]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy nội dung.' });
        invalidateGameConfig();
        await refreshRuntimeConfig(pool);
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_delete_catalog', entityType: 'catalog', entityId: req.params.id, ipAddress: requestIp(req) });
        res.json({ ok: true });
    });

    router.get('/events', async (_req, res) => {
        const [rows] = await pool.query('SELECT * FROM game_events ORDER BY starts_at DESC');
        res.json({ events: rows.map(row => ({ ...row, reward: parseJson(row.reward_json), condition: parseJson(row.condition_json) })) });
    });

    router.post('/events', async (req, res) => {
        try {
            const event = normalizeEventPayload(req.body);
            const [result] = await pool.query('INSERT INTO game_events (name,banner_url,starts_at,ends_at,reward_json,condition_json,is_active) VALUES (?,?,?,?,?,?,?)', [event.name, event.bannerUrl, event.startsAt, event.endsAt, JSON.stringify(event.reward), JSON.stringify(event.condition), event.isActive ? 1 : 0]);
            await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_create_event', entityType: 'event', entityId: result.insertId, details: event, ipAddress: requestIp(req) });
            res.status(201).json({ id: Number(result.insertId), event });
        } catch (error) { res.status(400).json({ error: error.message }); }
    });

    router.put('/events/:id', async (req, res) => {
        try {
            const event = normalizeEventPayload(req.body);
            const [result] = await pool.query('UPDATE game_events SET name=?,banner_url=?,starts_at=?,ends_at=?,reward_json=?,condition_json=?,is_active=? WHERE id=?', [event.name, event.bannerUrl, event.startsAt, event.endsAt, JSON.stringify(event.reward), JSON.stringify(event.condition), event.isActive ? 1 : 0, number(req.params.id)]);
            if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy sự kiện.' });
            await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_update_event', entityType: 'event', entityId: req.params.id, details: event, ipAddress: requestIp(req) });
            res.json({ ok: true, event });
        } catch (error) { res.status(400).json({ error: error.message }); }
    });

    router.delete('/events/:id', async (req, res) => {
        const [result] = await pool.query('DELETE FROM game_events WHERE id=?', [number(req.params.id)]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Không tìm thấy sự kiện.' });
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_delete_event', entityType: 'event', entityId: req.params.id, ipAddress: requestIp(req) });
        res.json({ ok: true });
    });

    router.get('/leaderboards', async (req, res) => {
        const type = ['level', 'coins', 'farm', 'delivery'].includes(req.query.type) ? req.query.type : 'level';
        if (type === 'delivery') {
            const [rows] = await pool.query(`SELECT ws.user_id, f.name farm_name, SUM(ws.deliveries) value FROM weekly_scores ws JOIN farms f ON f.user_id=ws.user_id GROUP BY ws.user_id,f.name ORDER BY value DESC LIMIT 100`);
            return res.json({ type, rows });
        }
        const [source] = await pool.query(`SELECT u.id user_id,u.email,f.name farm_name,f.coins,ps.state_json FROM users u JOIN farms f ON f.user_id=u.id JOIN player_state ps ON ps.user_id=u.id WHERE u.role='player'`);
        const rows = source.map(row => {
            const state = safeState(row.state_json);
            const values = { level: number(state.level, 1), coins: number(row.coins), farm: number(state.stats?.harvestedTotal) };
            return { userId: Number(row.user_id), email: row.email, farmName: row.farm_name, value: values[type], level: number(state.level, 1), xp: number(state.xp) };
        }).sort((a, b) => b.value - a.value || b.xp - a.xp).slice(0, 100);
        res.json({ type, rows });
    });

    router.post('/leaderboards/reset', async (req, res) => {
        const type = String(req.body.type || 'delivery');
        if (type !== 'delivery') return res.status(400).json({ error: 'Chỉ bảng giao hàng theo kỳ có thể reset mà không phá tiến trình Player.' });
        await pool.query('DELETE FROM weekly_reward_claims');
        await pool.query('DELETE FROM weekly_scores');
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_reset_leaderboard', entityType: 'leaderboard', entityId: type, ipAddress: requestIp(req) });
        res.json({ ok: true });
    });

    router.get('/deliveries', async (req, res) => {
        const status = ['active', 'trashed'].includes(req.query.status) ? req.query.status : null;
        const [rows] = await pool.query(`SELECT d.*,u.email,f.name farm_name FROM delivery_orders d JOIN users u ON u.id=d.user_id JOIN farms f ON f.user_id=d.user_id ${status ? 'WHERE d.status=?' : ''} ORDER BY d.updated_at DESC LIMIT 200`, status ? [status] : []);
        res.json({ deliveries: rows.map(row => ({ ...row, items: parseJson(row.items_json) })) });
    });

    router.get('/statistics', async (_req, res) => {
        const [states] = await pool.query('SELECT state_json FROM player_state');
        const crops = {};
        const animals = {};
        let totalLevel = 0;
        states.forEach(row => {
            const state = safeState(row.state_json);
            totalLevel += number(state.level, 1);
            (state.plots || []).forEach(plot => { if (plot?.cropType) crops[plot.cropType] = (crops[plot.cropType] || 0) + 1; });
            Object.values(state.animalProduction?.animals || {}).forEach(animal => { if (animal?.type) animals[animal.type] = (animals[animal.type] || 0) + 1; });
        });
        const [[[market]], [[users]]] = await Promise.all([
            pool.query('SELECT COUNT(*) transactions,COALESCE(SUM(total_price),0) revenue FROM market_transactions'),
            pool.query("SELECT COUNT(*) total FROM users WHERE role='player'")
        ]);
        res.json({ players: number(users.total), averageLevel: states.length ? totalLevel / states.length : 0, popularCrops: crops, popularAnimals: animals, transactions: number(market.transactions), revenue: number(market.revenue) });
    });

    router.get('/logs', async (req, res) => {
        const params = [];
        const where = [];
        if (req.query.action) { where.push('l.action = ?'); params.push(String(req.query.action)); }
        if (req.query.userId) { where.push('l.user_id = ?'); params.push(number(req.query.userId)); }
        if (req.query.from) { where.push('l.created_at >= ?'); params.push(new Date(req.query.from)); }
        if (req.query.to) { where.push('l.created_at <= ?'); params.push(new Date(req.query.to)); }
        const [rows] = await pool.query(`SELECT l.*,u.email FROM system_logs l LEFT JOIN users u ON u.id=l.user_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.created_at DESC LIMIT 500`, params);
        res.json({ logs: rows.map(row => ({ ...row, details: parseJson(row.details_json) })) });
    });

    return router;
}

module.exports = { createAdminRouter };
