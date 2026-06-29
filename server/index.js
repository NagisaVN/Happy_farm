const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { pool, initDb } = require('./db');
const { getItemMeta, decorateListing } = require('./itemCatalog');
const {
    createPlayerState,
    savePlayerState,
    getCanonicalState,
    addInventoryItem,
    setInventoryQuantity
} = require('./stateStore');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const STALL_SLOT_LIMIT = 8;

app.use(cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true
}));
app.use(express.json({ limit: '3mb' }));

function signToken(user, farm) {
    return jwt.sign(
        {
            sub: String(user.id),
            email: user.email,
            farmId: farm?.id ? String(farm.id) : null
        },
        JWT_SECRET,
        { expiresIn: '7d' }
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

async function authRequired(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Missing auth token' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const [[user]] = await pool.query('SELECT id, email FROM users WHERE id = ?', [payload.sub]);
        if (!user) {
            return res.status(401).json({ error: 'User no longer exists' });
        }
        req.user = user;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired auth token' });
    }
}

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

app.get('/api/health', async (_req, res) => {
    res.json({ ok: true });
});

app.post('/api/auth/register', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const farmName = String(req.body.farmName || 'Happy Farm').trim().slice(0, 64) || 'Happy Farm';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Email is invalid' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const passwordHash = await bcrypt.hash(password, 12);
        const [userResult] = await conn.query(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)',
            [email, passwordHash]
        );
        const user = { id: userResult.insertId, email };
        const starter = await createPlayerState(conn, user.id, farmName);
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
        return res.status(401).json({ error: 'Email or password is incorrect' });
    }

    const [[farm]] = await pool.query('SELECT * FROM farms WHERE user_id = ?', [user.id]);
    if (!farm) {
        return res.status(500).json({ error: 'Account has no farm' });
    }

    res.json({
        token: signToken(user, farm),
        profile: profileFromRows(user, farm)
    });
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
        const state = await savePlayerState(conn, req.user.id, req.body.state || req.body);
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
        await conn.query('UPDATE farms SET coins = coins + ? WHERE user_id = ?', [totalPrice, listing.seller_user_id]);
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

app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`Happy Farm server running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('Could not start server. Check MySQL settings and .env.');
        console.error(err);
        process.exit(1);
    });
