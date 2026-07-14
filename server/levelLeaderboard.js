function parseState(value) {
    if (value && typeof value === 'object') return value;
    try {
        return JSON.parse(value || '{}');
    } catch {
        return {};
    }
}

function buildLevelLeaderboard(rows = [], currentUserId, limit = 20) {
    const ranked = rows.map(row => {
        const state = parseState(row.stateJson ?? row.state_json ?? row.state);
        return {
            userId: Number(row.userId ?? row.user_id),
            farmId: Number(row.farmId ?? row.farm_id),
            farmName: row.farmName ?? row.farm_name ?? 'Happy Farm',
            ownerName: row.ownerName ?? row.owner_name ?? 'farmer',
            level: Math.max(1, Number.parseInt(state.level, 10) || 1),
            xp: Math.max(0, Number.parseInt(state.xp, 10) || 0)
        };
    }).sort((a, b) => (
        b.level - a.level
        || b.xp - a.xp
        || a.userId - b.userId
    )).map((row, index) => ({
        ...row,
        rank: index + 1,
        isMine: row.userId === Number(currentUserId)
    }));

    return {
        top: ranked.slice(0, Math.max(1, Number(limit) || 20)),
        me: ranked.find(row => row.isMine) || null
    };
}

module.exports = { buildLevelLeaderboard };
