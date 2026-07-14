const ADMIN_TOKEN_KEY = 'happy_farm_admin_token';

export class AdminApi {
    constructor() { this.token = localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
    setToken(token) { this.token = token || ''; this.token ? localStorage.setItem(ADMIN_TOKEN_KEY, this.token) : localStorage.removeItem(ADMIN_TOKEN_KEY); }
    logout() { this.setToken(''); }
    async request(path, options = {}) {
        const headers = { ...(options.headers || {}) };
        if (this.token) headers.Authorization = `Bearer ${this.token}`;
        if (options.body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetch(`/api/admin${path}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
        const payload = (response.headers.get('content-type') || '').includes('application/json') ? await response.json() : {};
        if (!response.ok) {
            if (response.status === 401 || response.status === 403 || response.status === 423) this.logout();
            throw new Error(payload.error || 'Không thể kết nối API Admin.');
        }
        return payload;
    }
    login(email, password) { return this.request('/auth/login', { method: 'POST', body: { email, password } }); }
    me() { return this.request('/me'); }
    async uploadImage(file) {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
            reader.readAsDataURL(file);
        });
        return this.request('/uploads', { method: 'POST', body: { fileName: file.name, dataUrl } });
    }
    dashboard() { return this.request('/dashboard'); }
    players(params = {}) { return this.request(`/players?${new URLSearchParams(params)}`); }
    player(id) { return this.request(`/players/${id}`); }
    playerStatus(id, status) { return this.request(`/players/${id}/status`, { method: 'PATCH', body: { status } }); }
    deletePlayer(id, confirmEmail) { return this.request(`/players/${id}`, { method: 'DELETE', body: { confirmEmail } }); }
    resetPlayer(id, type) { return this.request(`/players/${id}/reset`, { method: 'POST', body: { type } }); }
    catalog(type = '') { return this.request(`/catalog${type ? `?type=${encodeURIComponent(type)}` : ''}`); }
    createCatalog(item) { return this.request('/catalog', { method: 'POST', body: item }); }
    updateCatalog(id, item) { return this.request(`/catalog/${id}`, { method: 'PUT', body: item }); }
    deleteCatalog(id) { return this.request(`/catalog/${id}`, { method: 'DELETE' }); }
    events() { return this.request('/events'); }
    createEvent(event) { return this.request('/events', { method: 'POST', body: event }); }
    updateEvent(id, event) { return this.request(`/events/${id}`, { method: 'PUT', body: event }); }
    deleteEvent(id) { return this.request(`/events/${id}`, { method: 'DELETE' }); }
    leaderboards(type) { return this.request(`/leaderboards?type=${encodeURIComponent(type)}`); }
    resetLeaderboard(type) { return this.request('/leaderboards/reset', { method: 'POST', body: { type } }); }
    deliveries(status = '') { return this.request(`/deliveries${status ? `?status=${status}` : ''}`); }
    statistics() { return this.request('/statistics'); }
    logs(params = {}) { return this.request(`/logs?${new URLSearchParams(params)}`); }
    systemSettings(group = '') { return this.request(`/system-settings${group ? `/${encodeURIComponent(group)}` : ''}`); }
    updateSystemSetting(id, payload) { return this.request(`/system-settings/${id}`, { method: 'PUT', body: payload }); }
    updateSystemSettings(settings) { return this.request('/system-settings/batch', { method: 'PUT', body: { settings } }); }
    shop(params = {}) { return this.request(`/shop?${new URLSearchParams(params)}`); }
    shopProduct(id) { return this.request(`/shop/${id}`); }
    createShopProduct(product) { return this.request('/shop', { method: 'POST', body: product }); }
    updateShopProduct(id, product) { return this.request(`/shop/${id}`, { method: 'PUT', body: product }); }
    deleteShopProduct(id) { return this.request(`/shop/${id}`, { method: 'DELETE' }); }
    updateShopStatus(id, status) { return this.request('/shop/status', { method: 'PUT', body: { id, status } }); }
    updateShopFlashSale(payload) { return this.request('/shop/flash-sale', { method: 'PUT', body: payload }); }
    sortShopProducts(items) { return this.request('/shop/sort', { method: 'PUT', body: { items } }); }
    cloneShopProduct(id) { return this.request(`/shop/${id}/clone`, { method: 'POST', body: {} }); }
    createShopCategory(category) { return this.request('/shop/categories', { method: 'POST', body: category }); }
}

export default new AdminApi();
