async function writeAuditLog(conn, {
    userId = null,
    actorRole = 'system',
    action,
    entityType = null,
    entityId = null,
    details = {},
    ipAddress = null
}) {
    if (!action) return;
    await conn.query(
        `INSERT INTO system_logs
         (user_id, actor_role, action, entity_type, entity_id, details_json, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, actorRole, action, entityType, entityId, JSON.stringify(details || {}), ipAddress]
    );
}

function requestIp(req) {
    return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
}

module.exports = { writeAuditLog, requestIp };
