const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { createDefaultState, normalizeState } = require('./defaultState');
const { decorateListing, getItemMeta } = require('./itemCatalog');
const { buildLevelLeaderboard } = require('./levelLeaderboard');
const {
    normalizeEmail,
    normalizeFarmName,
    validateEmail,
    validateFarmName,
    validatePassword
} = require('./accountRules');
const {
    ORDER_SLOT_COUNT,
    TRASH_COOLDOWN_MS,
    getWeekInfo,
    getPreviousWeekInfo,
    generateOrder,
    applyRewardToState,
    getRankReward,
    decorateMilestones,
    getCooldownRemainingMs
} = require('./deliveryRules');

const DATA_FILE = process.env.LOCAL_DEV_DB_FILE || path.join(os.tmpdir(), 'happy-farm-local-dev.json');

function loadDb() {
    let db;
    try {
        db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        db = {
            nextUserId: 1,
            nextFarmId: 1,
            nextListingId: 1,
            nextOrderId: 1,
            users: [],
            farms: [],
            listings: [],
            orderRows: [],
            weeklyScores: [],
            weeklyRewardClaims: []
        };
    }

    db.nextOrderId = db.nextOrderId || 1;
    db.orderRows = Array.isArray(db.orderRows) ? db.orderRows : [];
    db.weeklyScores = Array.isArray(db.weeklyScores) ? db.weeklyScores : [];
    db.weeklyRewardClaims = Array.isArray(db.weeklyRewardClaims) ? db.weeklyRewardClaims : [];
    db.users = (db.users || []).map(user => ({ role: 'player', status: 'active', ...user }));
    return db;
}

function saveDb(db) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function signToken(user, farm, jwtSecret) {
    return jwt.sign(
        {
            sub: String(user.id),
            email: user.email,
            role: user.role || 'player',
            farmId: farm?.id ? String(farm.id) : null
        },
        jwtSecret,
        { expiresIn: '7d' }
    );
}

function profileFromUser(db, user) {
    const farm = db.farms.find(item => Number(item.userId) === Number(user.id));
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

function createAccount(db, email, password, farmName = 'Happy Farm') {
    const passwordHash = bcrypt.hashSync(password, 12);
    const user = {
        id: db.nextUserId++,
        email,
        passwordHash,
        role: 'player',
        status: 'active'
    };
    const state = createDefaultState(farmName);
    const farm = {
        id: db.nextFarmId++,
        userId: user.id,
        name: state.farmName,
        coins: state.coins,
        gems: state.gems,
        importedLocalSave: false,
        state
    };
    db.users.push(user);
    db.farms.push(farm);
    saveDb(db);
    return { user, farm };
}

function getFarmForUser(db, userId) {
    return db.farms.find(item => Number(item.userId) === Number(userId));
}

function getActiveListings(db, where = () => true) {
    return db.listings
        .filter(item => item.status === 'active')
        .filter(where)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 100)
        .map(listing => {
            const farm = db.farms.find(item => Number(item.id) === Number(listing.farmId));
            const user = db.users.find(item => Number(item.id) === Number(listing.sellerUserId));
            return decorateListing({
                id: listing.id,
                seller_user_id: listing.sellerUserId,
                farm_id: listing.farmId,
                farm_name: farm?.name || 'Happy Farm',
                seller_name: publicSellerName(user?.email),
                category: listing.category,
                item_id: listing.itemId,
                quantity: listing.quantity,
                price_each: listing.priceEach,
                created_at: listing.createdAt
            });
        });
}

function createLocalOrder(db, userId, weekId, slotIndex, now = new Date()) {
    const farm = getFarmForUser(db, userId);
    const playerLevel = Number(farm?.state?.level) || 1;
    const generated = generateOrder({
        userId,
        weekId,
        slotIndex,
        level: playerLevel,
        entropy: `${Date.now()}:${Math.random()}`
    });
    return {
        id: db.nextOrderId++,
        userId: Number(userId),
        weekId,
        slotIndex,
        status: 'active',
        items: generated.items,
        rewardCoins: generated.rewardCoins,
        rewardXp: generated.rewardXp,
        weeklyPoints: generated.weeklyPoints,
        generatedAt: now.toISOString(),
        cooldownUntil: null
    };
}

function replaceLocalOrder(db, row, now = new Date()) {
    const fresh = createLocalOrder(db, row.userId, row.weekId, row.slotIndex, now);
    row.status = 'active';
    row.items = fresh.items;
    row.rewardCoins = fresh.rewardCoins;
    row.rewardXp = fresh.rewardXp;
    row.weeklyPoints = fresh.weeklyPoints;
    row.generatedAt = fresh.generatedAt;
    row.cooldownUntil = null;
}

function ensureLocalOrders(db, userId, now = new Date()) {
    const weekInfo = getWeekInfo(now);
    for (let slotIndex = 0; slotIndex < ORDER_SLOT_COUNT; slotIndex += 1) {
        let row = db.orderRows.find(item => (
            Number(item.userId) === Number(userId)
            && item.weekId === weekInfo.weekId
            && Number(item.slotIndex) === slotIndex
        ));
        if (!row) {
            row = createLocalOrder(db, userId, weekInfo.weekId, slotIndex, now);
            db.orderRows.push(row);
        } else if (row.status === 'trashed' && getCooldownRemainingMs(row.cooldownUntil, now) === 0) {
            replaceLocalOrder(db, row, now);
        }
    }

    return {
        weekInfo,
        orders: db.orderRows
            .filter(item => Number(item.userId) === Number(userId) && item.weekId === weekInfo.weekId)
            .sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex))
            .map(item => ({ ...item }))
    };
}

function getLocalScore(db, userId, weekId) {
    let score = db.weeklyScores.find(item => Number(item.userId) === Number(userId) && item.weekId === weekId);
    if (!score) {
        score = { userId: Number(userId), weekId, points: 0, deliveries: 0, updatedAt: new Date(0).toISOString() };
        db.weeklyScores.push(score);
    }
    return score;
}

function getLocalWeeklyStatus(db, userId, weekInfo, now = new Date()) {
    const score = getLocalScore(db, userId, weekInfo.weekId);
    const claimedIds = db.weeklyRewardClaims
        .filter(item => (
            Number(item.userId) === Number(userId)
            && item.weekId === weekInfo.weekId
            && item.rewardType === 'milestone'
        ))
        .map(item => item.rewardId);

    return {
        weekId: weekInfo.weekId,
        startsAt: weekInfo.startsAt,
        endsAt: weekInfo.endsAt,
        serverNow: now.toISOString(),
        score: {
            points: Number(score.points || 0),
            deliveries: Number(score.deliveries || 0)
        },
        milestones: decorateMilestones(score.points, claimedIds)
    };
}

function getLocalDeliveryBoard(db, userId, now = new Date()) {
    const board = ensureLocalOrders(db, userId, now);
    return {
        orders: board.orders,
        weekly: getLocalWeeklyStatus(db, userId, board.weekInfo, now)
    };
}

function assertLocalOrderItems(farm, order) {
    for (const item of order.items) {
        const available = Number(farm.state.inventory?.[item.category]?.[item.itemId] || 0);
        if (available < Number(item.quantity)) {
            const err = new Error('Không đủ nông sản để giao đơn này');
            err.status = 400;
            throw err;
        }
    }
}

function deductLocalOrderItems(farm, order) {
    order.items.forEach(item => {
        farm.state.inventory[item.category][item.itemId] =
            Number(farm.state.inventory[item.category][item.itemId] || 0) - Number(item.quantity);
    });
}

function getLocalRankInfo(db, userId, weekId) {
    const mine = db.weeklyScores.find(item => Number(item.userId) === Number(userId) && item.weekId === weekId);
    const points = Number(mine?.points || 0);
    if (!mine || points <= 0) return null;
    const betterCount = db.weeklyScores.filter(item => item.weekId === weekId && Number(item.points || 0) > points).length;
    return {
        rank: betterCount + 1,
        points,
        deliveries: Number(mine.deliveries || 0)
    };
}

function getLocalPreviousRankRewardStatus(db, userId, now = new Date()) {
    const previousWeek = getPreviousWeekInfo(now);
    const rankInfo = getLocalRankInfo(db, userId, previousWeek.weekId);
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

    const reward = getRankReward(rankInfo.rank);
    const claimed = db.weeklyRewardClaims.some(item => (
        Number(item.userId) === Number(userId)
        && item.weekId === previousWeek.weekId
        && item.rewardType === 'rank'
        && item.rewardId === 'rank'
    ));

    return {
        weekId: previousWeek.weekId,
        ...rankInfo,
        reward,
        claimable: Boolean(reward) && !claimed,
        claimed
    };
}

function authMiddleware(jwtSecret) {
    return (req, res, next) => {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Missing auth token' });

        try {
            const payload = jwt.verify(token, jwtSecret);
            const db = loadDb();
            const user = db.users.find(item => Number(item.id) === Number(payload.sub));
            if (!user) return res.status(401).json({ error: 'User no longer exists' });
            if (user.status === 'locked') return res.status(423).json({ error: 'Tài khoản đã bị khóa.' });
            if (user.role !== 'player') return res.status(403).json({ error: 'Admin không được truy cập gameplay.' });
            req.localDb = db;
            req.user = user;
            next();
        } catch {
            res.status(401).json({ error: 'Invalid or expired auth token' });
        }
    };
}

function startLocalFallbackServer({ port, jwtSecret }) {
    const app = express();
    const requireAuth = authMiddleware(jwtSecret);

    app.use(cors({
        origin: process.env.CLIENT_ORIGIN || true,
        credentials: true
    }));
    app.use(express.json({ limit: '3mb' }));

    app.get('/api/health', (_req, res) => {
        res.json({ ok: true, mode: 'local-fallback' });
    });

    app.use('/api/admin', (_req, res) => {
        res.status(503).json({ error: 'Admin Dashboard yêu cầu kết nối MySQL.' });
    });

    app.post('/api/auth/register', async (req, res) => {
        const db = loadDb();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const farmName = String(req.body.farmName || 'Happy Farm').trim().slice(0, 64) || 'Happy Farm';

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Email is invalid' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        if (db.users.some(user => user.email === email)) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const { user, farm } = createAccount(db, email, password, farmName);
        res.status(201).json({
            token: signToken(user, farm, jwtSecret),
            profile: profileFromUser(loadDb(), user)
        });
    });

    app.post('/api/auth/login', async (req, res) => {
        const db = loadDb();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        let user = db.users.find(item => item.email === email);

        if (!user && db.users.length === 0 && password.length >= 6) {
            user = createAccount(db, email, password, 'Happy Farm').user;
        }

        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: 'Email or password is incorrect' });
        }

        const freshDb = loadDb();
        const farm = getFarmForUser(freshDb, user.id);
        res.json({
            token: signToken(user, farm, jwtSecret),
            profile: profileFromUser(freshDb, user)
        });
    });

    app.get('/api/me/profile', requireAuth, (req, res) => {
        const farm = getFarmForUser(req.localDb, req.user.id);
        if (!farm) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        res.json({ profile: profileFromUser(req.localDb, req.user) });
    });

    app.put('/api/me/profile', requireAuth, (req, res) => {
        const db = req.localDb;
        const email = normalizeEmail(req.body.email);
        const farmName = normalizeFarmName(req.body.farmName);
        const validationError = validateEmail(email) || validateFarmName(farmName);
        if (validationError) return res.status(400).json({ error: validationError });
        if (db.users.some(user => user.email === email && Number(user.id) !== Number(req.user.id))) {
            return res.status(409).json({ error: 'Email này đã được sử dụng.' });
        }

        const user = db.users.find(item => Number(item.id) === Number(req.user.id));
        const farm = getFarmForUser(db, req.user.id);
        if (!user || !farm) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });

        user.email = email;
        farm.name = farmName;
        farm.state = normalizeState(farm.state, farmName);
        farm.state.farmName = farmName;
        saveDb(db);

        res.json({
            token: signToken(user, farm, jwtSecret),
            profile: profileFromUser(db, user),
            state: farm.state
        });
    });

    app.put('/api/me/password', requireAuth, async (req, res) => {
        const currentPassword = String(req.body.currentPassword || '');
        const newPassword = String(req.body.newPassword || '');
        const validationError = validatePassword(newPassword, 'Mật khẩu mới');
        if (validationError) return res.status(400).json({ error: validationError });
        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại.' });
        }

        const user = req.localDb.users.find(item => Number(item.id) === Number(req.user.id));
        if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
            return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 12);
        saveDb(req.localDb);
        res.json({ ok: true, message: 'Đổi mật khẩu thành công.' });
    });

    app.get('/api/me/state', requireAuth, (req, res) => {
        const farm = getFarmForUser(req.localDb, req.user.id);
        res.json({
            profile: profileFromUser(req.localDb, req.user),
            importedLocalSave: Boolean(farm.importedLocalSave),
            state: normalizeState(farm.state, farm.name)
        });
    });

    app.put('/api/me/state', requireAuth, (req, res) => {
        const db = req.localDb;
        const farm = getFarmForUser(db, req.user.id);
        const state = normalizeState(req.body.state || req.body, farm.name);
        farm.name = state.farmName;
        farm.coins = state.coins;
        farm.gems = state.gems;
        farm.state = state;
        saveDb(db);
        res.json({ state });
    });

    app.post('/api/me/import-local-save', requireAuth, (req, res) => {
        const db = req.localDb;
        const farm = getFarmForUser(db, req.user.id);
        if (farm.importedLocalSave) {
            return res.status(409).json({ error: 'Local save has already been imported' });
        }
        farm.state = normalizeState(req.body.state || req.body, farm.name);
        farm.name = farm.state.farmName;
        farm.coins = farm.state.coins;
        farm.gems = farm.state.gems;
        farm.importedLocalSave = true;
        saveDb(db);
        res.json({ state: farm.state });
    });

    app.get('/api/orders', requireAuth, (req, res) => {
        const db = req.localDb;
        const board = getLocalDeliveryBoard(db, req.user.id);
        saveDb(db);
        res.json(board);
    });

    app.post('/api/orders/:orderId/deliver', requireAuth, (req, res) => {
        const db = req.localDb;
        const now = new Date();
        const board = ensureLocalOrders(db, req.user.id, now);
        const order = board.orders.find(item => Number(item.id) === Number(req.params.orderId));
        if (!order || order.status !== 'active') {
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng đang hoạt động' });
        }

        const farm = getFarmForUser(db, req.user.id);
        farm.state = normalizeState(farm.state, farm.name);

        try {
            assertLocalOrderItems(farm, order);
            deductLocalOrderItems(farm, order);
            applyRewardToState(farm.state, {
                coins: order.rewardCoins,
                xp: order.rewardXp
            });
        } catch (err) {
            return res.status(err.status || 500).json({ error: err.message || 'Không giao được đơn hàng' });
        }

        const score = getLocalScore(db, req.user.id, board.weekInfo.weekId);
        score.points = Number(score.points || 0) + Number(order.weeklyPoints || 0);
        score.deliveries = Number(score.deliveries || 0) + 1;
        score.updatedAt = now.toISOString();

        const row = db.orderRows.find(item => Number(item.id) === Number(order.id));
        replaceLocalOrder(db, row, now);
        farm.name = farm.state.farmName;
        farm.coins = farm.state.coins;
        farm.gems = farm.state.gems;

        const refreshed = getLocalDeliveryBoard(db, req.user.id, now);
        saveDb(db);
        res.json({
            state: farm.state,
            orders: refreshed.orders,
            weekly: refreshed.weekly,
            delivered: {
                rewardCoins: order.rewardCoins,
                rewardXp: order.rewardXp,
                weeklyPoints: order.weeklyPoints
            }
        });
    });

    app.post('/api/orders/:orderId/trash', requireAuth, (req, res) => {
        const db = req.localDb;
        const now = new Date();
        const board = ensureLocalOrders(db, req.user.id, now);
        const order = board.orders.find(item => Number(item.id) === Number(req.params.orderId));
        if (!order || order.status !== 'active') {
            return res.status(404).json({ error: 'Không tìm thấy đơn hàng đang hoạt động' });
        }

        const row = db.orderRows.find(item => Number(item.id) === Number(order.id));
        row.status = 'trashed';
        row.cooldownUntil = new Date(now.getTime() + TRASH_COOLDOWN_MS).toISOString();
        const refreshed = getLocalDeliveryBoard(db, req.user.id, now);
        saveDb(db);
        res.json(refreshed);
    });

    app.post('/api/weekly/milestones/:milestoneId/claim', requireAuth, (req, res) => {
        const db = req.localDb;
        const now = new Date();
        const weekInfo = getWeekInfo(now);
        const farm = getFarmForUser(db, req.user.id);
        const weekly = getLocalWeeklyStatus(db, req.user.id, weekInfo, now);
        const milestone = weekly.milestones.find(item => item.id === String(req.params.milestoneId || ''));

        if (!milestone || !milestone.claimable) {
            return res.status(400).json({ error: 'Mốc thưởng tuần này chưa thể nhận' });
        }

        farm.state = normalizeState(farm.state, farm.name);
        applyRewardToState(farm.state, milestone.reward);
        farm.name = farm.state.farmName;
        farm.coins = farm.state.coins;
        farm.gems = farm.state.gems;
        db.weeklyRewardClaims.push({
            userId: Number(req.user.id),
            weekId: weekInfo.weekId,
            rewardType: 'milestone',
            rewardId: milestone.id,
            claimedAt: now.toISOString()
        });
        const refreshedWeekly = getLocalWeeklyStatus(db, req.user.id, weekInfo, now);
        saveDb(db);
        res.json({ state: farm.state, weekly: refreshedWeekly });
    });

    app.get('/api/leaderboard/weekly', requireAuth, (req, res) => {
        const db = req.localDb;
        const now = new Date();
        const weekInfo = getWeekInfo(now);
        const top = db.weeklyScores
            .filter(item => item.weekId === weekInfo.weekId && Number(item.points || 0) > 0)
            .sort((a, b) => {
                if (Number(b.points || 0) !== Number(a.points || 0)) {
                    return Number(b.points || 0) - Number(a.points || 0);
                }
                if (Number(b.deliveries || 0) !== Number(a.deliveries || 0)) {
                    return Number(b.deliveries || 0) - Number(a.deliveries || 0);
                }
                return new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0);
            })
            .slice(0, 20)
            .map((score, index) => {
                const farm = getFarmForUser(db, score.userId);
                const user = db.users.find(item => Number(item.id) === Number(score.userId));
                return {
                    rank: index + 1,
                    userId: Number(score.userId),
                    farmId: Number(farm?.id || 0),
                    farmName: farm?.name || 'Happy Farm',
                    ownerName: publicSellerName(user?.email),
                    points: Number(score.points || 0),
                    deliveries: Number(score.deliveries || 0),
                    isMine: Number(score.userId) === Number(req.user.id)
                };
            });

        res.json({
            weekly: {
                weekId: weekInfo.weekId,
                startsAt: weekInfo.startsAt,
                endsAt: weekInfo.endsAt,
                serverNow: now.toISOString(),
                top,
                me: getLocalRankInfo(db, req.user.id, weekInfo.weekId)
            },
            previousReward: getLocalPreviousRankRewardStatus(db, req.user.id, now)
        });
    });

    app.get('/api/leaderboard/levels', requireAuth, (req, res) => {
        const leaderboard = buildLevelLeaderboard(
            req.localDb.farms.map(farm => {
                const user = req.localDb.users.find(item => Number(item.id) === Number(farm.userId));
                return {
                    userId: farm.userId,
                    farmId: farm.id,
                    farmName: farm.name,
                    ownerName: publicSellerName(user?.email),
                    state: farm.state
                };
            }),
            req.user.id
        );
        res.json({ leaderboard });
    });

    app.post('/api/leaderboard/weekly/claim-rank-reward', requireAuth, (req, res) => {
        const db = req.localDb;
        const now = new Date();
        const previousWeek = getPreviousWeekInfo(now);
        const rankInfo = getLocalRankInfo(db, req.user.id, previousWeek.weekId);
        const rankReward = rankInfo ? getRankReward(rankInfo.rank) : null;

        if (!rankInfo || !rankReward) {
            return res.status(400).json({ error: 'Không có thưởng xếp hạng tuần trước' });
        }
        const alreadyClaimed = db.weeklyRewardClaims.some(item => (
            Number(item.userId) === Number(req.user.id)
            && item.weekId === previousWeek.weekId
            && item.rewardType === 'rank'
            && item.rewardId === 'rank'
        ));
        if (alreadyClaimed) {
            return res.status(409).json({ error: 'Thưởng xếp hạng tuần trước đã được nhận' });
        }

        const farm = getFarmForUser(db, req.user.id);
        farm.state = normalizeState(farm.state, farm.name);
        applyRewardToState(farm.state, rankReward.reward);
        farm.name = farm.state.farmName;
        farm.coins = farm.state.coins;
        farm.gems = farm.state.gems;
        db.weeklyRewardClaims.push({
            userId: Number(req.user.id),
            weekId: previousWeek.weekId,
            rewardType: 'rank',
            rewardId: 'rank',
            claimedAt: now.toISOString()
        });

        const previousReward = getLocalPreviousRankRewardStatus(db, req.user.id, now);
        saveDb(db);
        res.json({ state: farm.state, previousReward });
    });

    app.get('/api/market', requireAuth, (req, res) => {
        const search = String(req.query.search || '').toLowerCase();
        const listings = getActiveListings(req.localDb, listing => {
            if (req.query.category && listing.category !== req.query.category) return false;
            if (req.query.itemId && listing.itemId !== req.query.itemId) return false;
            if (!search) return true;
            const farm = req.localDb.farms.find(item => Number(item.id) === Number(listing.farmId));
            return listing.itemId.toLowerCase().includes(search) || String(farm?.name || '').toLowerCase().includes(search);
        });
        res.json({ listings });
    });

    app.post('/api/market/listings', requireAuth, (req, res) => {
        const db = req.localDb;
        const farm = getFarmForUser(db, req.user.id);
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

        const inventory = farm.state.inventory || {};
        const available = Number(inventory[category]?.[itemId] || 0);
        if (available < quantity) {
            return res.status(400).json({ error: 'Not enough items in inventory' });
        }

        inventory[category][itemId] = available - quantity;
        const listing = {
            id: db.nextListingId++,
            sellerUserId: req.user.id,
            farmId: farm.id,
            category,
            itemId,
            quantity,
            priceEach,
            status: 'active',
            createdAt: new Date().toISOString()
        };
        db.listings.push(listing);
        saveDb(db);
        res.status(201).json({ listingId: listing.id, state: farm.state });
    });

    app.delete('/api/market/listings/:id', requireAuth, (req, res) => {
        const db = req.localDb;
        const listing = db.listings.find(item => Number(item.id) === Number(req.params.id));
        if (!listing || listing.status !== 'active' || Number(listing.sellerUserId) !== Number(req.user.id)) {
            return res.status(404).json({ error: 'Active listing not found' });
        }

        const farm = getFarmForUser(db, req.user.id);
        farm.state.inventory[listing.category][listing.itemId] =
            Number(farm.state.inventory[listing.category]?.[listing.itemId] || 0) + Number(listing.quantity);
        listing.status = 'cancelled';
        saveDb(db);
        res.json({ state: farm.state });
    });

    app.post('/api/market/listings/:id/buy', requireAuth, (req, res) => {
        const db = req.localDb;
        const listing = db.listings.find(item => Number(item.id) === Number(req.params.id));
        if (!listing || listing.status !== 'active') {
            return res.status(409).json({ error: 'Item has been sold' });
        }
        if (Number(listing.sellerUserId) === Number(req.user.id)) {
            return res.status(400).json({ error: 'You cannot buy your own listing' });
        }

        const buyerFarm = getFarmForUser(db, req.user.id);
        const sellerFarm = getFarmForUser(db, listing.sellerUserId);
        const totalPrice = Number(listing.quantity) * Number(listing.priceEach);
        if (Number(buyerFarm.state.coins) < totalPrice) {
            return res.status(400).json({ error: 'Not enough coins' });
        }

        buyerFarm.state.coins -= totalPrice;
        sellerFarm.state.coins += totalPrice;
        buyerFarm.state.inventory[listing.category][listing.itemId] =
            Number(buyerFarm.state.inventory[listing.category]?.[listing.itemId] || 0) + Number(listing.quantity);
        listing.status = 'sold';
        saveDb(db);
        res.json({ state: buyerFarm.state });
    });

    app.get('/api/farms/:farmId', requireAuth, (req, res) => {
        const farm = req.localDb.farms.find(item => Number(item.id) === Number(req.params.farmId));
        if (!farm) return res.status(404).json({ error: 'Farm not found' });
        const user = req.localDb.users.find(item => Number(item.id) === Number(farm.userId));
        res.json({
            farm: {
                id: Number(farm.id),
                name: farm.name,
                ownerName: publicSellerName(user?.email),
                isMine: Number(farm.userId) === Number(req.user.id)
            },
            state: normalizeState(farm.state, farm.name),
            stall: getActiveListings(req.localDb, listing => Number(listing.farmId) === Number(farm.id))
        });
    });

    app.get('/api/farms/:farmId/stall', requireAuth, (req, res) => {
        res.json({
            stall: getActiveListings(req.localDb, listing => Number(listing.farmId) === Number(req.params.farmId))
        });
    });

    app.use(express.static(path.join(__dirname, '..', 'dist')));
    app.get(/.*/, (_req, res) => {
        res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
    });

    app.listen(port, '127.0.0.1', () => {
        console.log(`Happy Farm local fallback server running on http://127.0.0.1:${port}`);
        console.log(`Local fallback data: ${DATA_FILE}`);
    });
}

module.exports = {
    startLocalFallbackServer
};
