import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ROLES, hasMinRole, isAdmin, isStaffOrAbove, hasPermission } from '../utils/roles';
import authService from '../services/authService';
import { setAccessToken } from '../services/api';
import { formatApiError } from '../utils/errorUtils';
import useUIStore from './uiStore';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
let idleTimer = null;
let idleStartedAt = 0;   // timestamp when timer started
let idleRemainingMs = 0;  // remaining ms when paused (tab hidden)

const clearIdleTimer = () => {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    idleStartedAt = 0;
    idleRemainingMs = 0;
};

const startIdleTimer = (logoutFn, ms = IDLE_TIMEOUT_MS) => {
    clearIdleTimer();
    idleStartedAt = Date.now();
    idleRemainingMs = ms;
    idleTimer = setTimeout(() => {
        logoutFn();
        window.location.assign('/login');
    }, ms);
};

const resetIdleTimer = (logoutFn) => () => startIdleTimer(logoutFn);

const IDLE_EVENTS = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];

const attachIdleListeners = (logoutFn) => {
    const handler = resetIdleTimer(logoutFn);
    IDLE_EVENTS.forEach(evt => window.addEventListener(evt, handler, { passive: true }));

    // Pause timer when tab is hidden, resume with remaining time when visible
    const onVisChange = () => {
        if (document.hidden) {
            // Tab hidden: save remaining time and clear timer.
            if (idleTimer && idleStartedAt) {
                const elapsed = Date.now() - idleStartedAt;
                idleRemainingMs = Math.max(0, idleRemainingMs - elapsed);
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        } else {
            // Tab visible: resume with remaining time, or logout if expired.
            if (idleRemainingMs <= 0) {
                logoutFn();
                window.location.assign('/login');
            } else {
                startIdleTimer(logoutFn, idleRemainingMs);
            }
        }
    };
    document.addEventListener('visibilitychange', onVisChange);

    // Return both handlers for cleanup
    handler._visHandler = onVisChange;
    return handler;
};

const detachIdleListeners = (handler) => {
    if (handler) {
        IDLE_EVENTS.forEach(evt => window.removeEventListener(evt, handler));
        if (handler._visHandler) document.removeEventListener('visibilitychange', handler._visHandler);
    }
};

const mapUserResponse = (user) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username,
    role: user.role,
    avatar: user.avatar,
    department: user.department,
    studentId: user.studentId ?? user.student_id ?? '',
    isActive: user.isActive ?? user.is_active,
    isFlagged: user.isFlagged ?? user.is_flagged ?? false,
    overdueCount: user.overdueCount ?? user.overdue_count ?? 0,
    creditScore: user.creditScore ?? user.credit_score ?? 100,
    earlyReturnCount: user.earlyReturnCount ?? user.early_return_count ?? 0,
    createdAt: user.date_joined,
});

// Keep the idle handler at module level, not in Zustand state,
// because persist() would try to serialize the function to localStorage.
let _currentIdleHandler = null;
let _initializeAuthPromise = null;

// zustand store - mas simple kesa Redux, less boilerplate
const useAuthStore = create(
    persist(
        (set, get) => ({
            // --- state ---
            user: null,
            token: null,                 // access token in memory only
            isAuthenticated: false,
            isInitializing: true,        // true until the reload bootstrap (initializeAuth) resolves
            isLoading: false,
            error: null,

            // role helpers
            getUserRole: () => get().user?.role || ROLES.STUDENT,
            isAdmin: () => isAdmin(get().user?.role),
            isStaff: () => isStaffOrAbove(get().user?.role),
            hasMinRole: (requiredRole) => hasMinRole(get().user?.role, requiredRole),
            hasPermission: (permission) => hasPermission(get().user?.role, permission),

            // actions
            setUser: (user) => set({ user, isAuthenticated: !!user }),
            // Access token lives in state (for the WS) AND in services/api.js memory
            // (for the request interceptor). Keep both in sync here.
            setToken: (token) => { set({ token }); setAccessToken(token); },
            clearError: () => set({ error: null }),

            login: async (credentials) => {
                set({ isLoading: true, error: null });
                try {
                    const email = credentials.email?.trim().toLowerCase();
                    const response = await authService.login(email, credentials.password);

                    const user = response.user;
                    const token = response.access;
                    // refresh token is now set by the server as an HttpOnly cookie.

                    setAccessToken(token);
                    set({
                        user: mapUserResponse(user),
                        token,
                        isAuthenticated: true,
                        isLoading: false
                    });

                    // Load per-user UI settings (theme, etc.)
                    useUIStore.getState().loadUserSettings(user.id);

                    // Start idle session timeout
                    const logoutFn = get().logout;
                    const handler = attachIdleListeners(logoutFn);
                    _currentIdleHandler = handler;
                    startIdleTimer(logoutFn);

                    return { success: true, user };
                } catch (error) {
                    const errorMessage = error.response?.data?.detail ||
                        error.response?.data?.error ||
                        error.message ||
                        'Login failed';

                    // Backend returns 'ACCOUNT_DEACTIVATED' specifically for inactive accounts
                    const isDeactivated = errorMessage === 'ACCOUNT_DEACTIVATED' ||
                        (typeof errorMessage === 'object' && errorMessage?.detail === 'ACCOUNT_DEACTIVATED');

                    if (isDeactivated) {
                        set({ isLoading: false });
                        window.location.assign('/deactivated');
                        return { success: false, error: 'Account deactivated' };
                    }

                    set({ error: errorMessage, isLoading: false });
                    return { success: false, error: errorMessage };
                }
            },

            register: async (userData) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await authService.register({
                        username: userData.username || userData.email.split('@')[0],
                        email: userData.email,
                        password: userData.password,
                        password2: userData.password,
                        fullName: userData.fullName,
                        role: userData.role || ROLES.STUDENT,
                        department: userData.department || '',
                        student_id: userData.studentId || '',
                    });

                    const user = response.user;
                    const token = response.access;
                    // refresh token is set by the server as an HttpOnly cookie.

                    setAccessToken(token);
                    set({
                        user: mapUserResponse(user),
                        token,
                        isAuthenticated: true,
                        isLoading: false
                    });

                    // Load per-user UI settings (theme, etc.)
                    useUIStore.getState().loadUserSettings(user.id);

                    // Start idle session timeout (same as login)
                    const logoutFn = get().logout;
                    _currentIdleHandler = attachIdleListeners(logoutFn);
                    startIdleTimer(logoutFn);

                    return { success: true, message: 'Registration successful' };
                } catch (error) {
                    const errorMessage = formatApiError(error, 'Registration failed');
                    set({ error: errorMessage, isLoading: false });
                    return { success: false, error: errorMessage };
                }
            },

            updateProfile: async (profileData) => {
                set({ isLoading: true, error: null });
                try {
                    const editableProfile = {
                        fullName: profileData.fullName,
                        department: profileData.department,
                        phone: profileData.phone,
                    };
                    const response = await authService.updateProfile(editableProfile);

                    const currentUser = get().user;
                    const updatedUser = { ...currentUser, ...mapUserResponse(response) };

                    set({ user: updatedUser, isLoading: false });
                    return { success: true, user: updatedUser };
                } catch (error) {
                    const errorMessage = formatApiError(error, 'Failed to update profile');
                    set({ error: errorMessage, isLoading: false });
                    return { success: false, error: errorMessage };
                }
            },

            updateAvatar: async (file) => {
                set({ isLoading: true, error: null });
                try {
                    const response = await authService.uploadAvatar(file);

                    const currentUser = get().user;
                    const updatedUser = {
                        ...currentUser,
                        avatar: response.avatar,
                    };

                    set({ user: updatedUser, isLoading: false });
                    return { success: true, user: updatedUser };
                } catch (error) {
                    const errorMessage = error.response?.data?.detail || error.message;
                    set({ error: errorMessage, isLoading: false });
                    return { success: false, error: errorMessage };
                }
            },

            changePassword: async (passwordData) => {
                set({ isLoading: true, error: null });
                try {
                    await authService.changePassword(
                        passwordData.currentPassword,
                        passwordData.newPassword
                    );

                    set({ isLoading: false });
                    return { success: true, message: 'Password changed successfully' };
                } catch (error) {
                    const errorMessage = error.response?.data?.detail ||
                        error.response?.data?.old_password?.[0] ||
                        error.message;
                    set({ error: errorMessage, isLoading: false });
                    return { success: false, error: errorMessage };
                }
            },

            _idleHandler: null,

            refreshProfile: async () => {
                try {
                    const profile = await authService.getProfile();
                    const mapped = mapUserResponse(profile);
                    const current = get().user;
                    const changed = current && Object.keys(mapped).some((key) => current[key] !== mapped[key]);
                    if (changed) {
                        set({ user: { ...current, ...mapped } });
                    }
                    // if account was deactivated, redirect to deactivated page
                    if (mapped.isActive === false) {
                        get().logout();
                        window.location.assign('/deactivated');
                    }
                } catch {
                    // Background check only; retry on the next interval.
                }
            },

            // Re-mint the in-memory access token from the HttpOnly refresh cookie
            // on app start (the access token doesn't survive a reload). Gated by a
            // loading flag so ProtectedRoute doesn't flash/redirect prematurely.
            initializeAuth: async () => {
                if (!get().isAuthenticated) {
                    set({ isInitializing: false });
                    return false;
                }

                if (_initializeAuthPromise) {
                    return _initializeAuthPromise;
                }

                _initializeAuthPromise = (async () => {
                    try {
                        const { access } = await authService.refresh();
                        get().setToken(access);
                        // Reattach the idle timer after a page reload.
                        detachIdleListeners(_currentIdleHandler);
                        const logoutFn = get().logout;
                        _currentIdleHandler = attachIdleListeners(logoutFn);
                        startIdleTimer(logoutFn);
                        // Check account flags after the session is restored.
                        get().refreshProfile();
                        return true;
                    } catch {
                        // Refresh cookie missing or expired: drop the stale session.
                        setAccessToken(null);
                        set({ user: null, token: null, isAuthenticated: false });
                        return false;
                    } finally {
                        set({ isInitializing: false });
                        _initializeAuthPromise = null;
                    }
                })();

                return _initializeAuthPromise;
            },

            logout: () => {
                // Clear idle timer and listeners
                clearIdleTimer();
                detachIdleListeners(_currentIdleHandler);
                _currentIdleHandler = null;
                // Best-effort backend logout: blacklist the refresh token + clear the cookie.
                authService.logout().catch(() => {});
                setAccessToken(null);
                // Reset UI settings to defaults
                useUIStore.getState().resetToDefaults();
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                    error: null,
                    _idleHandler: null,
                });
            },


        }),
        {
            name: 'auth-storage',
            // Persist only non-sensitive session markers. Tokens are NEVER
            // persisted: the access token is in-memory, the refresh token is an
            // HttpOnly cookie. `user` + `isAuthenticated` are kept so the reload
            // bootstrap (initializeAuth) knows to silently refresh.
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated
            }),
        }
    )
);

export default useAuthStore;
