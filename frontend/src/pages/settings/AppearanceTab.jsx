import React from 'react';
import { Sun, Moon, Monitor, Check, Palette, SquaresFour, Sparkle } from '@phosphor-icons/react';
import { Toggle } from '../../components/ui';
import { SettingsGroup, SettingCard } from '../../components/settings';
import useUIStore, { ACCENT_PRESETS } from '../../store/uiStore';

const themeOptions = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
];

// Map accent names to visible hex colors for the swatch
const SWATCH_COLORS = {
    indigo: '#6366f1',
    violet: '#8b5cf6',
    blue: '#3b82f6',
    emerald: '#10b981',
    rose: '#f43f5e',
    amber: '#f59e0b',
    slate: '#64748b',
    green: '#22c55e',
};

const BG_EFFECTS = [
    { id: 'none', label: 'None', emoji: '⚪' },
    { id: 'stars', label: 'Stars', emoji: '✨' },
    { id: 'meteors', label: 'Meteors', emoji: '☄️' },
    { id: 'particles', label: 'Particles', emoji: '🫧' },
    { id: 'aurora', label: 'Aurora', emoji: '🌌' },
    { id: 'matrix', label: 'Matrix', emoji: '💻' },
];

const AppearanceTab = ({ theme, setTheme, backgroundEffect, setBackgroundEffect }) => {
    const { accentColor, setAccentColor, compactMode, setCompactMode } = useUIStore();
    const currentAccentLabel = ACCENT_PRESETS[accentColor]?.label || 'Indigo';
    const currentEffectLabel = BG_EFFECTS.find(e => e.id === backgroundEffect)?.label || 'None';

    return (
        <div className="space-y-5">
            <SettingsGroup title="Theme & color">
                {/* Theme */}
                <SettingCard icon={Sun} title="Theme" description="Light, dark, or follow your system" expandable defaultOpen>
                    <div className="grid grid-cols-3 gap-3">
                        {themeOptions.map((option) => {
                            const Icon = option.icon;
                            const isActive = theme === option.id;
                            return (
                                <button
                                    key={option.id}
                                    onClick={() => setTheme(option.id)}
                                    aria-pressed={isActive}
                                    className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-1.5 ${isActive
                                        ? 'border-accent bg-accent/5 dark:bg-accent/10 ring-2 ring-accent/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <Icon size={20} className={isActive ? 'text-accent' : 'text-gray-400 dark:text-gray-500'} />
                                    <span className={`text-xs font-medium ${isActive ? 'text-accent' : 'text-gray-600 dark:text-gray-400'}`}>
                                        {option.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </SettingCard>

                {/* Accent color */}
                <SettingCard icon={Palette} title="Accent color" description={`Currently ${currentAccentLabel}`} expandable>
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                        {Object.entries(ACCENT_PRESETS).map(([key, preset]) => {
                            const isActive = accentColor === key;
                            const hex = SWATCH_COLORS[key] || '#6366f1';
                            return (
                                <button
                                    key={key}
                                    onClick={() => setAccentColor(key)}
                                    className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all ${isActive ? 'bg-gray-100 dark:bg-gray-700/50' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                    title={preset.label}
                                    aria-label={preset.label}
                                    aria-pressed={isActive}
                                >
                                    <span
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${isActive ? 'scale-110 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-800' : 'group-hover:scale-105'}`}
                                        style={{ backgroundColor: hex }}
                                    >
                                        {isActive && <Check size={14} className="text-white" weight="bold" />}
                                    </span>
                                    <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                                        {preset.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </SettingCard>

                {/* Background effects */}
                <SettingCard icon={Sparkle} title="Background effects" description={`Currently ${currentEffectLabel}`} expandable>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {BG_EFFECTS.map((effect) => {
                            const isActive = backgroundEffect === effect.id;
                            return (
                                <button
                                    key={effect.id}
                                    type="button"
                                    onClick={() => setBackgroundEffect(effect.id)}
                                    aria-pressed={isActive}
                                    className={`p-2.5 rounded-lg border transition-all flex flex-col items-center gap-1 ${isActive
                                        ? 'border-accent bg-accent/5 dark:bg-accent/10'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <span className="text-xl">{effect.emoji}</span>
                                    <span className={`text-[10px] font-medium ${isActive ? 'text-accent' : 'text-gray-600 dark:text-gray-400'}`}>
                                        {effect.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </SettingCard>
            </SettingsGroup>

            <SettingsGroup title="Display">
                <SettingCard
                    icon={SquaresFour}
                    title="Compact mode"
                    description="Tighter spacing for more content on screen"
                    control={<Toggle checked={compactMode} onChange={setCompactMode} aria-label="Compact mode" />}
                />
            </SettingsGroup>
        </div>
    );
};

export default AppearanceTab;
