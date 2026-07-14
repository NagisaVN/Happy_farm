const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createAuthenticate, authorize } = require('../server/authMiddleware');

function responseRecorder() {
    return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('authenticate loads role and authorize only admits requested role', async () => {
    const secret = 'test-secret';
    const pool = { query: async () => [[{ id: 1, email: 'admin@example.com', role: 'admin', status: 'active' }]] };
    const req = { headers: { authorization: `Bearer ${jwt.sign({ sub: '1' }, secret)}` } };
    const res = responseRecorder();
    let authenticated = false;
    await createAuthenticate(pool, secret)(req, res, () => { authenticated = true; });
    assert.equal(authenticated, true);
    let authorized = false;
    authorize('admin')(req, res, () => { authorized = true; });
    assert.equal(authorized, true);
    authorize('player')(req, res, () => {});
    assert.equal(res.statusCode, 403);
});

test('locked users are rejected before authorization', async () => {
    const secret = 'test-secret';
    const pool = { query: async () => [[{ id: 2, role: 'player', status: 'locked' }]] };
    const req = { headers: { authorization: `Bearer ${jwt.sign({ sub: '2' }, secret)}` } };
    const res = responseRecorder();
    await createAuthenticate(pool, secret)(req, res, () => assert.fail('must not continue'));
    assert.equal(res.statusCode, 423);
});
