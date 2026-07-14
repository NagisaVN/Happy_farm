const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLevelLeaderboard } = require('../server/levelLeaderboard');

test('level leaderboard ranks by level, then XP, then user id', () => {
    const result = buildLevelLeaderboard([
        { userId: 3, farmId: 30, farmName: 'C', ownerName: 'c', state: { level: 5, xp: 80 } },
        { userId: 1, farmId: 10, farmName: 'A', ownerName: 'a', state: { level: 7, xp: 5 } },
        { userId: 2, farmId: 20, farmName: 'B', ownerName: 'b', state: { level: 5, xp: 100 } },
        { userId: 4, farmId: 40, farmName: 'D', ownerName: 'd', state: { level: 5, xp: 100 } }
    ], 3);

    assert.deepEqual(result.top.map(row => row.userId), [1, 2, 4, 3]);
    assert.equal(result.me.rank, 4);
    assert.equal(result.me.level, 5);
    assert.equal(result.me.xp, 80);
});

test('level leaderboard accepts serialized state and keeps current player outside top limit', () => {
    const result = buildLevelLeaderboard([
        { user_id: 1, farm_id: 10, state_json: JSON.stringify({ level: 9, xp: 0 }) },
        { user_id: 2, farm_id: 20, state_json: JSON.stringify({ level: 2, xp: 10 }) }
    ], 2, 1);

    assert.equal(result.top.length, 1);
    assert.equal(result.top[0].userId, 1);
    assert.equal(result.me.rank, 2);
});
