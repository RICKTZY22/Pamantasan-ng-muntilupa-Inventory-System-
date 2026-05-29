import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// kinukuha yung tokens directly from localStorage
// kasi pag nag-import tayo ng authStore dito, mag-circular dependency
// (authStore -> authService -> api -> authStore) kaya ganito na lang
const getTokens = () => {
    const authData = localStorage.getItem('auth-storage');
    if (authData) {
        try {
            const { state } = JSON.parse(authData);
            return {
                access: state?.token,
                refresh: state?.refreshToken,
            };
        } catch (e) {
            // corrupted storage — treat as unauthenticated
        }
    }
    return { access: null, refresh: null };
};

// Lazily import authStore to avoid circular dependency issues at module init time
const getAuthStore = () => import('../store/authStore').then(m => m.default ?? m);

// lagay ng bearer token sa every request
api.interceptors.request.use(
    (config) => {
        const { access } = getTokens();
        if (access) {
            config.headers.Authorization = `Bearer ${access}`;
        }
        return config;
    },
    (error) => { throw error; }
);

// Handle 401s by trying to refresh the access token
let isRefreshing = false;
let failedQueue = [];

// mutex queue para sa sabay-sabay na 401 errors
// kung walang 'to, mag 3 refresh requests na sabay-sabay when simultaneous calls fail
const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then(token => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                }).catch(err => { throw err; });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const { refresh } = getTokens();

            if (refresh) {
                try {
                    const response = await axios.post(`${API_URL}/auth/token/refresh/`, {
                        refresh: refresh
                    });

                    const { access } = response.data;

                    // i-sync yung bagong token sa zustand
                    const store = await getAuthStore();
                    store.getState().setToken(access);

                    processQueue(null, access);
                    originalRequest.headers.Authorization = `Bearer ${access}`;

                    return api(originalRequest);
                } catch (refreshError) {
                    processQueue(refreshError, null);
                    // Trigger proper logout through the store (clears all state + listeners)
                    const store = await getAuthStore();
                    store.getState().logout();
                    window.location.href = '/login';
                    throw refreshError;
                } finally {
                    isRefreshing = false;
                }
            } else {
                const store = await getAuthStore();
                store.getState().logout();
                window.location.href = '/login';
            }
        }

        throw error;
    }
);

export default api;
