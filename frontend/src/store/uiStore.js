import { create } from 'zustand';

/**
 * UI Store with per-user theme persistence.
 * Theme/appearance settings are keyed by user ID in localStorage
 * so each account has its own preferences.
 * Default theme for new accounts: 'dark'
 */



// Helper: get per-user storage key
const getUserKey = (userId) => userId ? `ui-prefs-${userId}` : null;

// Helper: load user prefs from localStorage
const loadUserPrefs = (userId) => {
    const key = getUserKey(userId);
    if (!key) return null;
    try {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : null;
    } catch {
        // localStorage unavailable or corrupt — fall back to defaults
        return null;
    }
};

// Helper: save user prefs to localStorage
const saveUserPrefs = (userId, prefs) => {
    const key = getUserKey(userId);
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(prefs));
    } catch {
        // localStorage full or unavailable — preference will not persist this session
    }
};

// Accent color presets (name → RGB triplets)
export const ACCENT_PRESETS = {
    indigo: { label: 'Indigo', rgb: '99 102 241', light: '129 140 248', dark: '79 70 229', a50: '238 242 255', a100: '224 231 255', a900: '49 46 129' },
    violet: { label: 'Violet', rgb: '139 92 246', light: '167 139 250', dark: '124 58 237', a50: '245 243 255', a100: '237 233 254', a900: '76 29 149' },
    blue: { label: 'Blue', rgb: '59 130 246', light: '96 165 250', dark: '37 99 235', a50: '239 246 255', a100: '219 234 254', a900: '30 58 138' },
    emerald: { label: 'Emerald', rgb: '16 185 129', light: '52 211 153', dark: '5 150 105', a50: '236 253 245', a100: '209 250 229', a900: '6 78 59' },
    rose: { label: 'Rose', rgb: '244 63 94', light: '251 113 133', dark: '225 29 72', a50: '255 241 242', a100: '255 228 230', a900: '136 19 55' },
    amber: { label: 'Amber', rgb: '245 158 11', light: '251 191 36', dark: '217 119 6', a50: '255 251 235', a100: '254 243 199', a900: '120 53 15' },
    slate: { label: 'Slate', rgb: '100 116 139', light: '148 163 184', dark: '71 85 105', a50: '248 250 252', a100: '241 245 249', a900: '15 23 42' },
    green: { label: 'Green', rgb: '0 104 55', light: '0 133 61', dark: '0 77 40', a50: '240 253 244', a100: '220 252 231', a900: '5 46 22' },
};

const useUIStore = create(
    (set, get) => ({
        // sidebar
        sidebarCollapsed: false,
        toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
        setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

        // theme (persisted per user)
        theme: 'dark',
        _currentUserId: null,

        // ── Persisted preference helper (STYLE-02: DRY) ──
        _setPersistedPref: (key, value) => {
            const userId = get()._currentUserId;
            set({ [key]: value });
            if (userId) {
                const prefs = loadUserPrefs(userId) || {};
                saveUserPrefs(userId, { ...prefs, [key]: value });
            }
        },

        setTheme: (theme) => get()._setPersistedPref('theme', theme),

        toggleTheme: () => {
            const newTheme = get().theme === 'light' ? 'dark' : 'light';
            get().setTheme(newTheme);
        },

        // accent color (per user)
        accentColor: 'indigo',
        setAccentColor: (color) => get()._setPersistedPref('accentColor', color),

        // background effect (per user)
        backgroundEffect: 'none',
        setBackgroundEffect: (effect) => get()._setPersistedPref('backgroundEffect', effect),

        // display prefs (per user)
        viewMode: 'table',       // 'table' or 'card'
        itemsPerPage: 10,        // 10, 25, 50
        showImages: true,
        compactMode: true,       // Dashboard Pro = compact by default
        setViewMode: (mode) => get()._setPersistedPref('viewMode', mode),
        setItemsPerPage: (count) => get()._setPersistedPref('itemsPerPage', count),
        setShowImages: (show) => get()._setPersistedPref('showImages', show),
        setCompactMode: (compact) => get()._setPersistedPref('compactMode', compact),

        getEffectiveTheme: () => {
            const { theme } = get();
            if (theme === 'system') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return theme;
        },

        // Restore prefs when the user logs in
        loadUserSettings: (userId) => {
            const prefs = loadUserPrefs(userId);
            set({
                _currentUserId: userId,
                theme: prefs?.theme || 'dark',
                accentColor: prefs?.accentColor || 'indigo',
                backgroundEffect: prefs?.backgroundEffect || 'none',
                sidebarCollapsed: prefs?.sidebarCollapsed ?? false,
                viewMode: prefs?.viewMode || 'table',
                itemsPerPage: prefs?.itemsPerPage || 10,
                showImages: prefs?.showImages ?? true,
                compactMode: prefs?.compactMode ?? true,
            });
        },

        // Call this when user logs out to reset to defaults
        resetToDefaults: () => {
            set({
                _currentUserId: null,
                theme: 'dark',
                accentColor: 'indigo',
                backgroundEffect: 'none',
                sidebarCollapsed: false,
                viewMode: 'table',
                itemsPerPage: 10,
                showImages: true,
                compactMode: true,
            });
        },
    })
);

export default useUIStore;
