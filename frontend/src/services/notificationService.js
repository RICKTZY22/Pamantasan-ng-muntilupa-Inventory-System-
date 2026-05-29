import api from './api';
import { fetchAllPages } from './pagination';

const notificationService = {
    getAll: async () => fetchAllPages('/requests/notifications/'),

    getUnreadCount: async () => {
        const response = await api.get('/requests/notifications/unread_count/');
        return response.data.count;
    },

    markAsRead: async (id) => {
        const response = await api.patch(`/requests/notifications/${id}/read/`);
        return response.data;
    },

    markAllAsRead: async () => {
        const response = await api.post('/requests/notifications/read_all/');
        return response.data;
    },

    deleteOne: async (id) => {
        const response = await api.delete(`/requests/notifications/${id}/`);
        return response.data;
    },

    clearAll: async () => {
        const response = await api.delete('/requests/notifications/clear_all/');
        return response.data;
    },
};

export default notificationService;
