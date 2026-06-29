const { createDefaultState, normalizeState } = require('./defaultState');
const { inventoryToRows, rowsToInventory } = require('./itemCatalog');

function parseStateJson(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

async function replaceInventory(conn, userId, inventory) {
    await conn.query('DELETE FROM inventory_items WHERE user_id = ?', [userId]);
    const rows = inventoryToRows(inventory);
    for (const row of rows) {
        await conn.query(
            'INSERT INTO inventory_items (user_id, category, item_id, quantity) VALUES (?, ?, ?, ?)',
            [userId, row.category, row.itemId, row.quantity]
        );
    }
}

async function createPlayerState(conn, userId, farmName = 'Happy Farm') {
    const state = createDefaultState(farmName);
    await conn.query(
        'INSERT INTO player_state (user_id, state_json) VALUES (?, ?)',
        [userId, JSON.stringify(state)]
    );
    await replaceInventory(conn, userId, state.inventory);
    return state;
}

async function savePlayerState(conn, userId, incomingState, importedLocalSave = null) {
    const normalized = normalizeState(incomingState, incomingState?.farmName || 'Happy Farm');
    await conn.query(
        'UPDATE farms SET name = ?, coins = ?, gems = ? WHERE user_id = ?',
        [normalized.farmName, normalized.coins, normalized.gems, userId]
    );
    if (importedLocalSave !== null) {
        await conn.query('UPDATE farms SET imported_local_save = ? WHERE user_id = ?', [importedLocalSave ? 1 : 0, userId]);
    }
    await conn.query(
        `INSERT INTO player_state (user_id, state_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
        [userId, JSON.stringify(normalized)]
    );
    await replaceInventory(conn, userId, normalized.inventory);
    return normalized;
}

async function getCanonicalState(conn, userId) {
    const [[farm]] = await conn.query('SELECT * FROM farms WHERE user_id = ?', [userId]);
    if (!farm) return null;

    const [[stateRow]] = await conn.query('SELECT state_json FROM player_state WHERE user_id = ?', [userId]);
    const [inventoryRows] = await conn.query(
        'SELECT category, item_id, quantity FROM inventory_items WHERE user_id = ?',
        [userId]
    );

    const state = normalizeState(parseStateJson(stateRow?.state_json), farm.name);
    state.farmName = farm.name;
    state.coins = Number(farm.coins) || 0;
    state.gems = Number(farm.gems) || 0;
    state.inventory = rowsToInventory(inventoryRows);

    await conn.query(
        `INSERT INTO player_state (user_id, state_json)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json)`,
        [userId, JSON.stringify(state)]
    );

    return {
        farm,
        state
    };
}

async function addInventoryItem(conn, userId, category, itemId, quantity) {
    await conn.query(
        `INSERT INTO inventory_items (user_id, category, item_id, quantity)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [userId, category, itemId, quantity]
    );
}

async function setInventoryQuantity(conn, userId, category, itemId, quantity) {
    await conn.query(
        `INSERT INTO inventory_items (user_id, category, item_id, quantity)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
        [userId, category, itemId, quantity]
    );
}

module.exports = {
    createPlayerState,
    savePlayerState,
    getCanonicalState,
    addInventoryItem,
    setInventoryQuantity
};
