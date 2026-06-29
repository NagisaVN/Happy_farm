const TOKEN_KEY = 'happy_farm_token';

class GameApi {
    constructor() {
        this.token = localStorage.getItem(TOKEN_KEY) || '';
        this.profile = null;
    }

    hasToken() {
        return Boolean(this.token);
    }

    setToken(token) {
        this.token = token || '';
        if (this.token) {
            localStorage.setItem(TOKEN_KEY, this.token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    logout() {
        this.profile = null;
        this.setToken('');
    }

    async request(path, options = {}) {
        const headers = {
            ...(options.headers || {})
        };

        if (this.token) {
            headers.Authorization = `Bearer ${this.token}`;
        }
        if (options.body && !(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(path, {
            ...options,
            headers,
            body: options.body && !(options.body instanceof FormData)
                ? JSON.stringify(options.body)
                : options.body
        });

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const payload = isJson ? await response.json() : {};

        if (!isJson) {
            throw new Error('API chưa kết nối tới backend. Hãy mở đúng port Vite có proxy hoặc restart dev server.');
        }

        if (!response.ok) {
            const error = new Error(payload.error || 'Request failed');
            error.status = response.status;
            error.payload = payload;
            if (response.status === 401) {
                this.logout();
            }
            throw error;
        }

        return payload;
    }

    async register({ email, password, farmName }) {
        const payload = await this.request('/api/auth/register', {
            method: 'POST',
            body: { email, password, farmName }
        });
        this.setToken(payload.token);
        this.profile = payload.profile;
        return payload;
    }

    async login({ email, password }) {
        const payload = await this.request('/api/auth/login', {
            method: 'POST',
            body: { email, password }
        });
        this.setToken(payload.token);
        this.profile = payload.profile;
        return payload;
    }

    async getState() {
        const payload = await this.request('/api/me/state');
        this.profile = payload.profile;
        return payload;
    }

    saveState(state) {
        return this.request('/api/me/state', {
            method: 'PUT',
            body: { state }
        });
    }

    importLocalSave(state) {
        return this.request('/api/me/import-local-save', {
            method: 'POST',
            body: { state }
        });
    }

    listMarket(filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                params.set(key, value);
            }
        });
        const query = params.toString();
        return this.request(`/api/market${query ? `?${query}` : ''}`);
    }

    createListing(listing) {
        return this.request('/api/market/listings', {
            method: 'POST',
            body: listing
        });
    }

    cancelListing(listingId) {
        return this.request(`/api/market/listings/${listingId}`, {
            method: 'DELETE'
        });
    }

    buyListing(listingId) {
        return this.request(`/api/market/listings/${listingId}/buy`, {
            method: 'POST'
        });
    }

    getFarm(farmId) {
        return this.request(`/api/farms/${farmId}`);
    }

    getFarmStall(farmId) {
        return this.request(`/api/farms/${farmId}/stall`);
    }
}

export const gameApi = new GameApi();
export default gameApi;
