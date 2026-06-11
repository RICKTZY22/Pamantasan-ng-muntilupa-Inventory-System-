import api from './api';

// Audit log API (staff+ read; clear is admin-only on the backend).
const auditService = {
    getLogs: async ({
        action = '', user = '', role = '', date = '', dateFrom = '', dateTo = '',
        item = '', request = '', limit = 200,
    } = {}) => {
        const params = new URLSearchParams();
        if (action) params.append('action', action);
        if (user) params.append('user', String(user));
        if (role) params.append('role', role);
        if (date) params.append('date', date);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (item) params.append('item', item);
        if (request) params.append('request', String(request));
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
