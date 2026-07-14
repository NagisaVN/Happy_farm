const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CROP_META,
    getWeekInfo,
    generateOrder,
    applyRewardToState,
    getRankReward,
    decorateMilestones,
    getCooldownRemainingMs
} = require('../server/deliveryRules');

test('getWeekInfo uses Monday 00:00 Asia/Saigon windows', () => {
    const week = getWeekInfo(new Date('2026-07-10T05:00:00.000Z'));
    assert.equal(week.weekId, '2026-07-06');
    assert.equal(week.startsAt, '2026-07-05T17:00:00.000Z');
    assert.equal(week.endsAt, '2026-07-12T17:00:00.000Z');
});

test('generateOrder only asks for supported crops and positive rewards', () => {
    const order = generateOrder({
        userId: 7,
        weekId: '2026-07-06',
        slotIndex: 2,
        entropy: 'fixed-test'
    });

    assert.ok(order.items.length >= 1);
    assert.ok(order.items.length <= 2);
    order.items.forEach(item => {
        assert.equal(item.category, 'crops');
        assert.ok(CROP_META[item.itemId]);
        assert.ok(item.quantity > 0);
    });
    assert.ok(order.rewardCoins > 0);
    assert.ok(order.rewardXp > 0);
    assert.ok(order.weeklyPoints > 0);
});

test('delivery orders only request crops unlocked at the player level', () => {
    const requiredLevels = { carrot: 1, corn: 2, tomato: 4, pumpkin: 6 };
    for (const level of [1, 2, 4, 6]) {
        for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
            const order = generateOrder({
                userId: 9,
                weekId: '2026-07-06',
                slotIndex,
                level,
                entropy: `level-${level}-${slotIndex}`
            });
            order.items.forEach(item => {
                assert.ok(requiredLevels[item.itemId] <= level);
            });
        }
    }
});

test('cooldown helper reaches zero after trash wait', () => {
    const now = new Date('2026-07-10T00:00:00.000Z');
    const cooldownUntil = new Date(now.getTime() + 60_000);
    assert.equal(getCooldownRemainingMs(cooldownUntil, now), 60_000);
    assert.equal(getCooldownRemainingMs(cooldownUntil, new Date(now.getTime() + 60_001)), 0);
});

test('applyRewardToState grants currencies, fertilizers, and level progress', () => {
    const state = {
        coins: 10,
        gems: 1,
        level: 1,
        xp: 90,
        xpNeeded: 100,
        inventory: { fertilizers: { mid: 0, high: 0 } },
        stats: { coinsEarnedTotal: 10 }
    };

    applyRewardToState(state, {
        coins: 300,
        gems: 5,
        xp: 50,
        fertilizers: { mid: 1 }
    });

    assert.equal(state.coins, 310);
    assert.equal(state.gems, 6);
    assert.equal(state.inventory.fertilizers.mid, 1);
    assert.equal(state.level, 2);
    assert.equal(state.xp, 40);
    assert.equal(state.xpNeeded, 125);
    assert.equal(state.stats.coinsEarnedTotal, 310);
});

test('milestones become unclaimable after their reward id is claimed', () => {
    const beforeClaim = decorateMilestones(350, []);
    assert.equal(beforeClaim.find(item => item.id === '100').claimable, true);
    assert.equal(beforeClaim.find(item => item.id === '300').claimable, true);

    const afterClaim = decorateMilestones(350, ['100', '300']);
    assert.equal(afterClaim.find(item => item.id === '100').claimable, false);
    assert.equal(afterClaim.find(item => item.id === '100').claimed, true);
    assert.equal(afterClaim.find(item => item.id === '300').claimable, false);
    assert.equal(afterClaim.find(item => item.id === '600').claimable, false);
});

test('rank rewards match weekly leaderboard bands', () => {
    assert.deepEqual(getRankReward(1).reward, { gems: 15, coins: 1500, xp: 500 });
    assert.deepEqual(getRankReward(3).reward, { gems: 10, coins: 1000, xp: 300 });
    assert.deepEqual(getRankReward(10).reward, { gems: 5, coins: 600, xp: 150 });
    assert.equal(getRankReward(11), null);
});
