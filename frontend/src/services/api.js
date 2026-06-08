import axios from 'axios';

const resolveApiUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host && host !== 'localhost' && host !== '127.0.0.1') {
            return `${window.location.protocol}//${host}:8000/api`;
        }
    }
    return 'http://localhost:8000/api';
};

export const API_URL = resolveApiUrl();

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    // Send/receive the HttpOnly refresh cookie on auth calls.
    withCredentials: true,
});

// Access token lives in MEMORY ONLY (never localStorage) so XSS can't read it.
// authStore sets it on login / bootstrap; the response interceptor refreshes it.
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token || null; };
export const getAccessToken = () => accessToken;

// Lazily import authStore to avoid a circular dependency at module init.
const getAuthStore = () => import('../store/authStore').then(m => m.default ?? m);

// Attach the in-memory access token to every request.
api.interceptors.request.use(
    (config) => {
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    },
    (error) => { throw error; }
);

// Handle 401s by refreshing via the HttpOnly cookie.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        // Never try to refresh the refresh call itself (prevents an infinite loop).
        const isRefreshCall = originalRequest?.url?.includes('/auth/token/refresh/');

        if (error.response?.status === 401 && !originalRequest._retry && !isRefreshCall) {
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

            try {
                // Refresh token rides in the HttpOnly cookie — no body needed.
                const response = await axios.post(
                    `${API_URL}/auth/token/refresh/`,
                    {},
                    { withCredentials: true },
                );
                const { access } = response.data;

                setAccessToken(access);
                const store = await getAuthStore();
                store.getState().setToken(access);  // keep WS/state in sync

                processQueue(null, access);
                originalRequest.headers.Authorization = `Bearer ${access}`;
                return api(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                // Refresh cookie gone/expired → full logout.
                const store = await getAuthStore();
                store.getState().logout();
                window.location.assign('/login');
                throw refreshError;
            } finally {
                isRefreshing = false;
            }
        }

        throw error;
    }
);

export default api;
