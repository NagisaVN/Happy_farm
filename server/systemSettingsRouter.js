const express = require('express');
const { writeAuditLog, requestIp } = require('./auditLog');
const {
    getSystemSettings, refreshSystemSettings, validateValue, serializeValue, mapRow
} = require('./systemSettingsStore');

function numericId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isFinite(id) && id > 0 ? id : 0;
}

function validateRelationships(changes, config) {
    const values = new Map(config.settings.map(item => [item.settingKey, item.value]));
    changes.forEach(change => values.set(change.setting.settingKey, change.newValue));
    if (Number(values.get('START_GOLD')) > Number(values.get('MAX_GOLD'))) {
        throw new Error('START_GOLD không được lớn hơn MAX_GOLD.');
    }
}

async function updateSetting(conn, id, input) {
    const [[row]] = await conn.query('SELECT * FROM system_settings WHERE id = ? FOR UPDATE', [id]);
    if (!row) {
        const error = new Error('Không tìm thấy cấu hình hệ thống.');
        error.status = 404;
        throw error;
    }
    const current = mapRow(row);
    if (!current.isEditable) {
        const error = new Error(`${current.settingKey} không cho phép chỉnh sửa.`);
        error.status = 403;
        throw error;
    }
    const rawValue = input.reset === true ? current.defaultValue : (input.value ?? input.settingValue);
    const nextValue = validateValue(rawValue, current);
    await conn.query('UPDATE system_settings SET setting_value = ? WHERE id = ?', [serializeValue(nextValue, current.valueType), id]);
    return { setting: current, oldValue: current.value, newValue: nextValue };
}

function createSystemSettingsRouter({ pool, onRefresh = null }) {
    const router = express.Router();

    router.get('/', async (_req, res) => {
        const config = await getSystemSettings(pool);
        res.json({ settings: config.settings });
    });

    router.get('/:group', async (req, res) => {
        const group = String(req.params.group || '').trim().toLowerCase();
        const config = await getSystemSettings(pool);
        const settings = config.settings.filter(item => item.groupName === group);
        if (!settings.length) return res.status(404).json({ error: 'Không tìm thấy nhóm cấu hình.' });
        res.json({ group, groupLabel: settings[0].groupLabel, settings });
    });

    router.put('/batch', async (req, res) => {
        const entries = Array.isArray(req.body.settings) ? req.body.settings : [];
        if (!entries.length) return res.status(400).json({ error: 'Danh sách cấu hình không được để trống.' });
        if (entries.length > 100) return res.status(400).json({ error: 'Mỗi lần chỉ được cập nhật tối đa 100 cấu hình.' });
        const ids = entries.map(entry => numericId(entry.id));
        if (ids.some(id => !id) || new Set(ids).size !== ids.length) return res.status(400).json({ error: 'ID cấu hình không hợp lệ hoặc bị trùng.' });

        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const changes = [];
            for (let index = 0; index < entries.length; index += 1) {
                changes.push(await updateSetting(conn, ids[index], entries[index]));
            }
            validateRelationships(changes, await getSystemSettings(pool));
            for (const change of changes) {
                await writeAuditLog(conn, {
                    userId: req.user.id, actorRole: 'admin', action: 'admin_update_system_setting',
                    entityType: 'system_setting', entityId: change.setting.id,
                    details: { settingKey: change.setting.settingKey, oldValue: change.oldValue, newValue: change.newValue },
                    ipAddress: requestIp(req)
                });
            }
            await conn.commit();
            const refreshed = await refreshSystemSettings(pool);
            if (onRefresh) await onRefresh();
            res.json({ ok: true, settings: changes.map(change => refreshed.byId.get(change.setting.id)) });
        } catch (error) {
            await conn.rollback();
            res.status(error.status || 400).json({ error: error.message || 'Không cập nhật được cấu hình.' });
        } finally {
            conn.release();
        }
    });

    router.put('/:id', async (req, res) => {
        const id = numericId(req.params.id);
        if (!id) return res.status(400).json({ error: 'ID cấu hình không hợp lệ.' });
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const change = await updateSetting(conn, id, req.body || {});
            validateRelationships([change], await getSystemSettings(pool));
            await writeAuditLog(conn, {
                userId: req.user.id, actorRole: 'admin', action: 'admin_update_system_setting',
                entityType: 'system_setting', entityId: id,
                details: { settingKey: change.setting.settingKey, oldValue: change.oldValue, newValue: change.newValue },
                ipAddress: requestIp(req)
            });
            await conn.commit();
            const refreshed = await refreshSystemSettings(pool);
            if (onRefresh) await onRefresh();
            res.json({ ok: true, setting: refreshed.byId.get(id) });
        } catch (error) {
            await conn.rollback();
            res.status(error.status || 400).json({ error: error.message || 'Không cập nhật được cấu hình.' });
        } finally {
            conn.release();
        }
    });

    return router;
}

module.exports = { createSystemSettingsRouter, updateSetting, validateRelationships };
