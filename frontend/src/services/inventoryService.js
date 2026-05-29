import api from './api';
import { fetchAllPages } from './pagination';

// Build multipart FormData from a payload, skipping null/undefined/empty values.
// Used when an item has a File field (e.g., image upload) — falls back to JSON otherwise.
const buildFormData = (payload) => {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
            formData.append(key, value);
        }
    });
    return formData;
};

const hasFileField = (payload) => Object.values(payload).some(v => v instanceof File);

const submitInventory = async (method, url, payload) => {
    if (hasFileField(payload)) {
        const response = await api[method](url, buildFormData(payload), {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    }
    const response = await api[method](url, payload);
    return response.data;
};

const inventoryService = {
    getAll: async (filters = {}) => {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.category) params.append('category', filters.category);
        if (filters.status) params.append('status', filters.status);

        return fetchAllPages(`/inventory/?${params.toString()}`);
    },

    create: (item) => submitInventory('post', '/inventory/', item),

    update: (id, data) => submitInventory('put', `/inventory/${id}/`, data),


    delete: async (id) => {
        const response = await api.delete(`/inventory/${id}/`);
        return response.data;  // backend returns 204 but axios wraps it
    },

    getLowStock: async () => fetchAllPages('/inventory/low_stock/'),

    getOutOfStock: async () => fetchAllPages('/inventory/out_of_stock/'),

    // this one's kinda redundant since we recompute stats from items
    // on the frontend, but the dashboard still uses it
    getStats: async () => {
        const response = await api.get('/inventory/stats/');
        return response.data;
    },

    changeStatus: async (id, data) => {
        const response = await api.post(`/inventory/${id}/change_status/`, data);
        return response.data;
    },

};

export default inventoryService;
