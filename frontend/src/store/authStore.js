import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ROLES, hasMinRole, isAdmin, isStaffOrAbove, hasPermission } from '../utils/roles';
import authService from '../services/authService';
import { formatApiError } from '../utils/errorUtils';
import useUIStore from './uiStore';

// 30 min idle timeout - requirement ng IT admin ng school
// para sa mga shared computers sa lab na nakakalimutan mag-logout ng mga students
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
        window.location.href = '/login';
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
            // Tab hidden → save remaining time and clear timer
            if (idleTimer && idleStartedAt) {
                const elapsed = Date.now() - idleStartedAt;
                idleRemainingMs = Math.max(0, idleRemainingMs - elapsed);
                clearTimeout(idleTimer);
                idleTimer = null;
            }
        } else {
            // Tab visible → resume with remaining time (or logout if expired)
            if (idleRemainingMs <= 0) {
                logoutFn();
                window.location.href = '/login';
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

// normalize yung user data galing sa API
// kasi minsan camelCase minsan snake_case yung backend, depende sa endpoint
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
    createdAt: user.date_joined,
});

// Keep idle handler reference at module level — NOT in Zustand state,
// because persist() would try to serialize the function to localStorage.
let _currentIdleHandler = null;

// zustand store - mas simple kesa Redux, less boilerplate
const useAuthStore = create(
    persist(
        (set, get) => ({
            // --- state ---
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
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
            setToken: (token) => set({ token }),
            clearError: () => set({ error: null }),

            login: async (credentials) => {
                set({ isLoading: true, error: null });
                try {
                    const email = credentials.email?.trim().toLowerCase();
                    const response = await authService.login(email, credentials.password);

                    const user = response.user;
                    const token = response.access;
                    const refreshToken = response.refresh;

                    set({
                        user: mapUserResponse(user),
                        token,
                        refreshToken,
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
                        window.location.href = '/deactivated';
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
                    const refreshToken = response.refresh;

                    set({
                        user: mapUserResponse(user),
                        token,
                        refreshToken,
                        isAuthenticated: true,
                        isLoading: false
                    });

                    // Load per-user UI settings (theme, etc.)
                    useUIStore.getState().loadUserSettings(user.id);

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
                    const response = await authService.updateProfile(profileData);

                    const currentUser = get().user;
                    const updatedUser = {
                        ...currentUser,
                        ...response,
                        fullName: response.fullName || `${response.first_name} ${response.last_name}`.trim(),
                    };

                    set({ user: updatedUser, isLoading: false });
                    return { success: true, user: updatedUser };
                } catch (error) {
                    const errorMessage = error.response?.data?.detail || error.message;
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

            // background profile refresh para makita agad pag na-flag or na-deactivate
            // tine-trigger 'to every 30s from DashboardLayout
            refreshProfile: async () => {
                try {
                    const profile = await authService.getProfile();
                    const mapped = mapUserResponse(profile);
                    const current = get().user;
                    // only update if something actually changed
                    if (current && (
                        current.isFlagged !== mapped.isFlagged ||
                        current.isActive !== mapped.isActive
                    )) {
                        set({ user: { ...current, ...mapped } });
                    }
                    // if account was deactivated, redirect to deactivated page
                    if (mapped.isActive === false) {
                        get().logout();
                        window.location.href = '/deactivated';
                    }
                } catch {
                    // don't care if this fails — it's just a background check
                }
            },

            logout: () => {
                // Clear idle timer and listeners
                clearIdleTimer();
                detachIdleListeners(_currentIdleHandler);
                _currentIdleHandler = null;
                // Reset UI settings to defaults
                useUIStore.getState().resetToDefaults();
                set({
                    user: null,
                    token: null,
                    refreshToken: null,
                    isAuthenticated: false,
                    error: null,
                    _idleHandler: null,
                });
            },


        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                refreshToken: state.refreshToken,
                isAuthenticated: state.isAuthenticated
            }),
        }
    )
);

export default useAuthStore;
