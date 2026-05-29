import { useEffect } from 'react';
import useUIStore, { ACCENT_PRESETS } from '../store/uiStore';
import useAuthStore from '../store/authStore';

/**
 * ThemeProvider component that applies:
 * - Dark/light class on <html>
 * - Accent color CSS variables on :root
 * - Listens for system preference changes when in 'system' mode
 * - Loads per-user UI settings on mount
 */
const ThemeProvider = ({ children }) => {
    const { theme, accentColor, getEffectiveTheme, loadUserSettings } = useUIStore();
    const user = useAuthStore((state) => state.user);

    // Load per-user settings on mount (handles page refresh scenario)
    useEffect(() => {
        if (user?.id) {
            loadUserSettings(user.id);
        }
    }, [user?.id, loadUserSettings]);

    // Apply theme class (dark/light)
    useEffect(() => {
        const applyTheme = () => {
            const effectiveTheme = getEffectiveTheme();
            const root = document.documentElement;
            if (effectiveTheme === 'dark') {
                root.classList.add('dark');
            } else {
                root.classList.remove('dark');
            }
        };

        applyTheme();

        // Listen for system preference changes when in 'system' mode
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            if (theme === 'system') applyTheme();
        };
        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, getEffectiveTheme]);

    // Apply accent color CSS variables
    useEffect(() => {
        const preset = ACCENT_PRESETS[accentColor] || ACCENT_PRESETS.indigo;
        const root = document.documentElement;

        root.style.setProperty('--accent', preset.rgb);
        root.style.setProperty('--accent-light', preset.light);
        root.style.setProperty('--accent-dark', preset.dark);
        root.style.setProperty('--accent-50', preset.a50);
        root.style.setProperty('--accent-100', preset.a100);
        root.style.setProperty('--accent-900', preset.a900);
    }, [accentColor]);

    return children;
};

export default ThemeProvider;
