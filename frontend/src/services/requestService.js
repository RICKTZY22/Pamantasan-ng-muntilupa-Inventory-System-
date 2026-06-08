import api from './api';
import { fetchAllPages } from './pagination';

const requestService = {
    getAll: async (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.status) params.append('status', filters.status);
        if (filters.priority) params.append('priority', filters.priority);
        if (filters.include_cleared) params.append('include_cleared', 'true');

        return fetchAllPages(`/requests/?${params.toString()}`);
    },

    // One server-paginated page for the Requests screen.
    listPage: async ({ page = 1, status = '', overdue = false, completed = false, mine = false, search = '', include_cleared = false } = {}) => {
        const params = new URLSearchParams();
        params.append('page', String(page));
        if (status) params.append('status', status);
        if (overdue) params.append('overdue', 'true');
        if (completed) params.append('completed', 'true');
        if (mine) params.append('mine', 'true');
        if (search) params.append('search', search);
        if (include_cleared) params.append('include_cleared', 'true');
        const response = await api.get(`/requests/?${params.toString()}`);
        return response.data;
    },


    create: async (request) => {
        const response = await api.post('/requests/', request);
        return response.data;
    },

    approve: async (id) => {
        const response = await api.post(`/requests/${id}/approve/`);
        return response.data;
    },

    reject: async (id, reason = '') => {
        const response = await api.post(`/requests/${id}/reject/`, { reason });
        return response.data;
    },

    complete: async (id) => {
        const response = await api.post(`/requests/${id}/complete/`);
        return response.data;
    },

    cancel: async (id) => {
        const response = await api.post(`/requests/${id}/cancel/`);
        return response.data;
    },

    getStats: async (range) => {
        // Reports passes a range (+ includes cleared history for accurate period
        // totals); the Requests page calls it with no args → active set, as before.
        const params = new URLSearchParams();
        if (range) { params.append('range', range); params.append('include_cleared', 'true'); }
        const qs = params.toString();
        const response = await api.get(`/requests/stats/${qs ? `?${qs}` : ''}`);
        return response.data;
    },

    // Top requested items for the Reports chart (server-aggregated, period-scoped).
    getPopularItems: async (range) => {
        const params = new URLSearchParams();
        if (range) params.append('range', range);
        params.append('include_cleared', 'true');
        const response = await api.get(`/requests/popular_items/?${params.toString()}`);
        return response.data;
    },

    // Overdue requests grouped by borrower for the Reports overdue panel.
    getOverdueGrouped: async (search = '') => {
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        const qs = params.toString();
        const response = await api.get(`/requests/overdue_grouped/${qs ? `?${qs}` : ''}`);
        return response.data;
    },

    // Two-step return handshake.
    requestReturn: async (id) => {
        const response = await api.post(`/requests/${id}/request_return/`);
        return response.data;
    },

    confirmReturn: async (id) => {
        const response = await api.post(`/requests/${id}/confirm_return/`);
        return response.data;
    },

    cancelReturn: async (id) => {
        const response = await api.post(`/requests/${id}/cancel_return/`);
        return response.data;
    },

    clearCompleted: async () => {
        const response = await api.delete('/requests/clear_completed/');
        return response.data;
    },

    checkOverdue: async () => {
        const response = await api.post('/requests/check_overdue/');
        return response.data;
    },

    clearHistory: async (code) => {
        const response = await api.post('/requests/clear_history/', { code });
        return response.data;
    },

    setClearCode: async (code) => {
        const response = await api.post('/requests/set_clear_code/', { code });
        return response.data;
    },
};

export default requestService;
