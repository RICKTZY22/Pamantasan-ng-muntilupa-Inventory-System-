import api from './api';

const authService = {
    login: async (email, password) => {
        const response = await api.post('/auth/login/', { email, password });
        return response.data;
    },

    // used by the background profile refresh to pick up flag/active changes
    getProfile: async () => {
        const response = await api.get('/auth/profile/');
        return response.data;
    },

    register: async (userData) => {
        const response = await api.post('/auth/register/', userData);
        return response.data;
    },


    updateProfile: async (data) => {
        const response = await api.put('/auth/profile/', data);
        return response.data;
    },

    changePassword: async (oldPassword, newPassword) => {
        const response = await api.post('/auth/profile/password/', {
            old_password: oldPassword,
            new_password: newPassword
        });
        return response.data;
    },

    uploadAvatar: async (file) => {
        const formData = new FormData();
        formData.append('avatar', file);
        const response = await api.post('/auth/profile/picture/', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },
};

export default authService;
