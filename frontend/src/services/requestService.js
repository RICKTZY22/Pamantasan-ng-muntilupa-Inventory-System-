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

    getComments: async (id) => {
        const response = await api.get(`/requests/${id}/comments/`);
        return response.data;
    },

    addComment: async (id, text) => {
        const response = await api.post(`/requests/${id}/comments/`, { text });
        return response.data;
    },

    getStats: async () => {
        const response = await api.get('/requests/stats/');
        return response.data;
    },

    returnItem: async (id) => {
        const response = await api.post(`/requests/${id}/return_item/`);
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
