import api from './api';

// Audit log API (staff+ read; clear is admin-only on the backend).
const auditService = {
    getLogs: async ({ action = '', user = '', date = '', limit = 200 } = {}) => {
        const params = new URLSearchParams();
        if (action) params.append('action', action);
        if (user) params.append('user', String(user));
        if (date) params.append('date', date);
        params.append('limit', String(limit));
        const response = await api.get(`/auth/audit-logs/?${params.toString()}`);
        return response.data;
    },

    clear: async () => {
        const response = await api.delete('/auth/audit-logs/');
        return response.data;
    },
};

export default auditService;
