const jwt = require('jsonwebtoken');

function createAuthenticate(pool, jwtSecret, options = {}) {
    return async function authenticate(req, res, next) {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Missing auth token' });
        try {
            const payload = jwt.verify(token, jwtSecret);
            const timeoutMinutes = Number(options.getSessionTimeoutMinutes?.() || 0);
            if (timeoutMinutes > 0 && Number(payload.iat) + (timeoutMinutes * 60) < Math.floor(Date.now() / 1000)) {
                return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn.' });
            }
            const [[user]] = await pool.query(
                'SELECT id, email, role, status FROM users WHERE id = ?',
                [payload.sub]
            );
            if (!user) return res.status(401).json({ error: 'User no longer exists' });
            if (user.status === 'locked') return res.status(423).json({ error: 'Tài khoản đã bị khóa.' });
            req.user = user;
            req.auth = payload;
            next();
        } catch (error) {
            if (error?.status) return res.status(error.status).json({ error: error.message });
            return res.status(401).json({ error: 'Invalid or expired auth token' });
        }
    };
}

function authorize(role) {
    return function authorizeRole(req, res, next) {
        if (!req.user || req.user.role !== role) {
            return res.status(403).json({ error: 'Bạn không có quyền truy cập chức năng này.' });
        }
        next();
    };
}

module.exports = { createAuthenticate, authorize };
