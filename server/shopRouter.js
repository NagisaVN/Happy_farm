const express = require('express');
const { normalizeShopPayload, SHOP_STATUSES } = require('./shopRules');
const { writeAuditLog, requestIp } = require('./auditLog');
const { SHOP_SELECT, getCategories, getAdminProducts, invalidateShopCache, mapProduct } = require('./shopStore');

function id(value) { return Math.max(0, Number.parseInt(value, 10) || 0); }

async function uniqueName(conn, name, excludeCatalogId = 0) {
    const [[duplicate]] = await conn.query('SELECT id FROM game_catalog WHERE LOWER(name)=LOWER(?) AND id<>? LIMIT 1', [name, excludeCatalogId]);
    if (duplicate) throw new Error('Tên sản phẩm đã tồn tại.');
}

async function loadProduct(conn, productId, lock = false) {
    const [[row]] = await conn.query(`${SHOP_SELECT} WHERE sp.id=?${lock ? ' FOR UPDATE' : ''}`, [productId]);
    return row ? mapProduct(row) : null;
}

function createShopRouter({ pool, refreshCatalog }) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        const [categories, all] = await Promise.all([getCategories(pool), getAdminProducts(pool)]);
        const search = String(req.query.search || '').trim().toLowerCase();
        const category = String(req.query.category || '');
        const status = String(req.query.status || '');
        const flash = String(req.query.flash || '');
        const discount = String(req.query.discount || '');
        const products = all.filter(item => {
            if (search && !`${item.name} ${item.code}`.toLowerCase().includes(search)) return false;
            if (category && item.categoryCode !== category) return false;
            if (status && item.status !== status) return false;
            if (flash === 'true' && !item.flashActive) return false;
            if (flash === 'false' && item.flashActive) return false;
            if (discount === 'true' && !item.discountActive) return false;
            if (discount === 'false' && item.discountActive) return false;
            return true;
        });
        res.json({ products, categories });
    });

    router.get('/:id', async (req, res) => {
        const [product, categories] = await Promise.all([loadProduct(pool, id(req.params.id)), getCategories(pool)]);
        if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm cửa hàng.' });
        res.json({ product, categories });
    });

    router.post('/categories', async (req, res) => {
        const name = String(req.body.name || '').trim().slice(0, 128);
        const code = String(req.body.code || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 64);
        const entityType = String(req.body.catalogEntityType || code).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32);
        if (!name || !code || !entityType) return res.status(400).json({ error: 'Thông tin danh mục không hợp lệ.' });
        try {
            const [[order]] = await pool.query('SELECT COALESCE(MAX(display_order),0)+1 next_order FROM shop_categories');
            const [result] = await pool.query('INSERT INTO shop_categories (code,name,catalog_entity_type,display_order) VALUES (?,?,?,?)', [code, name, entityType, order.next_order]);
            const category = { id: Number(result.insertId), code, name, catalog_entity_type: entityType, display_order: Number(order.next_order), is_active: true };
            await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_create_shop_category', entityType: 'shop_category', entityId: result.insertId, details: { oldValue: null, newValue: category }, ipAddress: requestIp(req) });
            res.status(201).json({ category });
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tên hoặc mã danh mục đã tồn tại.' });
            res.status(400).json({ error: error.message });
        }
    });

    router.post('/', async (req, res) => {
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const categories = await getCategories(conn);
            const item = normalizeShopPayload(req.body, categories);
            await uniqueName(conn, item.name);
            const [catalogResult] = await conn.query(
                `INSERT INTO game_catalog (entity_type,code,name,image_url,buy_price,sell_price,unlock_level,config_json,is_active,sort_order)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [item.entityType, item.code, item.name, item.imageUrl, item.buyPrice, item.sellPrice, item.unlockLevel, JSON.stringify(item.config), 1, item.displayOrder]
            );
            const [shopResult] = await conn.query(
                `INSERT INTO shop_products (catalog_item_id,category_id,sale_type,sale_value,flash_sale_price,flash_sale_start,flash_sale_end,flash_stock_limit,purchase_limit,purchase_limit_type,display_order,status,is_active)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [catalogResult.insertId, item.categoryId, item.saleType, item.saleValue, item.flashSalePrice, item.flashSaleStart, item.flashSaleEnd, item.flashStockLimit, item.purchaseLimit, item.purchaseLimitType, item.displayOrder, item.status, item.isActive ? 1 : 0]
            );
            await writeAuditLog(conn, { userId: req.user.id, actorRole: 'admin', action: 'admin_create_shop_product', entityType: 'shop_product', entityId: shopResult.insertId, details: { oldValue: null, newValue: item }, ipAddress: requestIp(req) });
            await conn.commit();
            invalidateShopCache(); await refreshCatalog();
            res.status(201).json({ id: Number(shopResult.insertId), product: await loadProduct(pool, shopResult.insertId) });
        } catch (error) {
            await conn.rollback();
            if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Mã hoặc tên sản phẩm đã tồn tại.' });
            res.status(400).json({ error: error.message });
        } finally { conn.release(); }
    });

    router.put('/status', async (req, res) => {
        const productId = id(req.body.id);
        const status = SHOP_STATUSES.has(req.body.status) ? req.body.status : null;
        if (!productId || !status) return res.status(400).json({ error: 'Trạng thái không hợp lệ.' });
        const oldValue = await loadProduct(pool, productId);
        if (!oldValue) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
        const isActive = status === 'selling' ? 1 : 0;
        await pool.query('UPDATE shop_products SET status=?,is_active=? WHERE id=?', [status, isActive, productId]);
        const newValue = await loadProduct(pool, productId);
        invalidateShopCache();
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_update_shop_status', entityType: 'shop_product', entityId: productId, details: { oldValue, newValue }, ipAddress: requestIp(req) });
        res.json({ ok: true, product: newValue });
    });

    router.put('/flash-sale', async (req, res) => {
        const productId = id(req.body.id);
        const current = await loadProduct(pool, productId);
        if (!current) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
        const categories = await getCategories(pool);
        const next = normalizeShopPayload({ ...current, ...req.body, categoryId: current.categoryId }, categories);
        await pool.query('UPDATE shop_products SET flash_sale_price=?,flash_sale_start=?,flash_sale_end=?,flash_stock_limit=?,flash_sold_count=0 WHERE id=?', [next.flashSalePrice, next.flashSaleStart, next.flashSaleEnd, next.flashStockLimit, productId]);
        const updated = await loadProduct(pool, productId);
        invalidateShopCache();
        await writeAuditLog(pool, { userId: req.user.id, actorRole: 'admin', action: 'admin_update_shop_flash_sale', entityType: 'shop_product', entityId: productId, details: { oldValue: current, newValue: updated }, ipAddress: requestIp(req) });
        res.json({ ok: true, product: updated });
    });

    router.put('/sort', async (req, res) => {
        const items = Array.isArray(req.body.items) ? req.body.items : [];
        if (!items.length || items.length > 500) return res.status(400).json({ error: 'Danh sách sắp xếp không hợp lệ.' });
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            for (const [index, item] of items.entries()) await conn.query('UPDATE shop_products SET display_order=? WHERE id=?', [Number.parseInt(item.displayOrder, 10) || index, id(item.id)]);
            await writeAuditLog(conn, { userId: req.user.id, actorRole: 'admin', action: 'admin_sort_shop_products', entityType: 'shop_product', details: { items }, ipAddress: requestIp(req) });
            await conn.commit(); invalidateShopCache(); res.json({ ok: true });
        } catch (error) { await conn.rollback(); res.status(400).json({ error: error.message }); } finally { conn.release(); }
    });

    router.post('/:id/clone', async (req, res) => {
        const source = await loadProduct(pool, id(req.params.id));
        if (!source) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
        let suffix = 1; let name; let code;
        do {
            name = `${source.name} - Bản sao ${suffix}`; code = `${source.code}-copy-${suffix}`;
            const [[exists]] = await pool.query('SELECT id FROM game_catalog WHERE LOWER(name)=LOWER(?) OR (entity_type=? AND code=?) LIMIT 1', [name, source.entityType, code]);
            if (!exists) break; suffix += 1;
        } while (suffix < 1000);
        req.body = { ...source, name, code, status: 'hidden', isActive: false, displayOrder: source.displayOrder + 1, flashSalePrice: null, flashSaleStart: null, flashSaleEnd: null };
        const categories = await getCategories(pool);
        const item = normalizeShopPayload(req.body, categories);
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [catalogResult] = await conn.query(`INSERT INTO game_catalog (entity_type,code,name,image_url,buy_price,sell_price,unlock_level,config_json,is_active,sort_order) VALUES (?,?,?,?,?,?,?,?,1,?)`, [item.entityType,item.code,item.name,item.imageUrl,item.buyPrice,item.sellPrice,item.unlockLevel,JSON.stringify(item.config),item.displayOrder]);
            const [result] = await conn.query(`INSERT INTO shop_products (catalog_item_id,category_id,sale_type,sale_value,purchase_limit,purchase_limit_type,display_order,status,is_active) VALUES (?,?,?,?,?,?,?,'hidden',0)`, [catalogResult.insertId,item.categoryId,item.saleType,item.saleValue,item.purchaseLimit,item.purchaseLimitType,item.displayOrder]);
            await writeAuditLog(conn,{userId:req.user.id,actorRole:'admin',action:'admin_clone_shop_product',entityType:'shop_product',entityId:result.insertId,details:{sourceId:source.id,newValue:item},ipAddress:requestIp(req)});
            await conn.commit(); invalidateShopCache(); await refreshCatalog(); res.status(201).json({id:Number(result.insertId),product:await loadProduct(pool,result.insertId)});
        } catch(error){await conn.rollback();res.status(400).json({error:error.message});}finally{conn.release();}
    });

    router.put('/:id', async (req, res) => {
        const productId = id(req.params.id); const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const oldValue = await loadProduct(conn, productId, true);
            if (!oldValue) { await conn.rollback(); return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' }); }
            const categories = await getCategories(conn); const item = normalizeShopPayload(req.body, categories);
            await uniqueName(conn, item.name, oldValue.catalogItemId);
            await conn.query('UPDATE game_catalog SET entity_type=?,code=?,name=?,image_url=?,buy_price=?,sell_price=?,unlock_level=?,config_json=?,is_active=1,sort_order=? WHERE id=?', [item.entityType,item.code,item.name,item.imageUrl,item.buyPrice,item.sellPrice,item.unlockLevel,JSON.stringify(item.config),item.displayOrder,oldValue.catalogItemId]);
            await conn.query(`UPDATE shop_products SET category_id=?,sale_type=?,sale_value=?,flash_sale_price=?,flash_sale_start=?,flash_sale_end=?,flash_stock_limit=?,purchase_limit=?,purchase_limit_type=?,display_order=?,status=?,is_active=? WHERE id=?`, [item.categoryId,item.saleType,item.saleValue,item.flashSalePrice,item.flashSaleStart,item.flashSaleEnd,item.flashStockLimit,item.purchaseLimit,item.purchaseLimitType,item.displayOrder,item.status,item.isActive?1:0,productId]);
            const newValue = { ...item, id: productId };
            await writeAuditLog(conn,{userId:req.user.id,actorRole:'admin',action:'admin_update_shop_product',entityType:'shop_product',entityId:productId,details:{oldValue,newValue},ipAddress:requestIp(req)});
            await conn.commit(); invalidateShopCache(); await refreshCatalog(); res.json({ok:true,product:await loadProduct(pool,productId)});
        } catch(error){await conn.rollback();if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'Mã hoặc tên sản phẩm đã tồn tại.'});res.status(400).json({error:error.message});}finally{conn.release();}
    });

    router.delete('/:id', async (req, res) => {
        const productId=id(req.params.id);const oldValue=await loadProduct(pool,productId);
        if(!oldValue)return res.status(404).json({error:'Không tìm thấy sản phẩm.'});
        await pool.query('DELETE FROM shop_products WHERE id=?',[productId]);invalidateShopCache();
        await writeAuditLog(pool,{userId:req.user.id,actorRole:'admin',action:'admin_remove_shop_product',entityType:'shop_product',entityId:productId,details:{oldValue,newValue:null},ipAddress:requestIp(req)});
        res.json({ok:true});
    });

    return router;
}

module.exports = { createShopRouter, loadProduct };
