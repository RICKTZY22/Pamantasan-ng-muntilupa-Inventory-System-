import { useCallback, useEffect, useState } from 'react';
import {
    Shield, Clock, DownloadSimple as Download,
    FloppyDisk as Save, ArrowsClockwise, UserPlus,
    Envelope, HardDrives, Database, Broom, Info, CheckCircle, Warning,
} from '@phosphor-icons/react';
import { Button, Toggle } from '../../components/ui';
import { SettingsGroup, SettingCard } from '../../components/settings';
import { AdminOnly } from '../../components/auth';
import api from '../../services/api';
import { exportCSV } from '../../utils/exportUtils';

const MaintenanceStatus = ({ endTime }) => {
    const [remaining, setRemaining] = useState(null);

    useEffect(() => {
        const tick = () => {
            if (endTime && endTime > Date.now()) {
                setRemaining(Math.ceil((endTime - Date.now()) / 60000));
            } else {
                setRemaining(null);
            }
        };
        tick();
        const id = setInterval(tick, 60000);
        return () => clearInterval(id);
    }, [endTime]);

    if (!remaining) return null;

    const hrs = Math.floor(remaining / 60);
    const mins = remaining % 60;
    return (
        <p className="text-xs text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Active — ends in {hrs > 0 ? `${hrs}h ` : ''}{mins}m
        </p>
    );
};

const AdminTab = ({
    adminSettings, setAdminSettings, flashMessage,
    saveSettings, adminPrefsKey,
    handleBackupNow, backupLoading,
}) => {
    const env = import.meta.env.MODE || 'development';
    const [userCount, setUserCount] = useState(null);
    const [maintenanceEndTime, setMaintenanceEndTime] = useState(0);

    const applyMaintenanceState = useCallback((data) => {
        const enabled = Boolean(data?.enabled && data?.endTime > Date.now());
        setMaintenanceEndTime(enabled ? data.endTime : 0);
        setAdminSettings(prev => ({ ...prev, maintenanceMode: enabled }));
    }, [setAdminSettings]);

    const refreshMaintenance = useCallback(async () => {
        try {
            const { data } = await api.get('/auth/maintenance/');
            applyMaintenanceState(data);
        } catch {
            return;
        }
    }, [applyMaintenanceState]);

    const updateMaintenance = useCallback(async (enabled, durationMins = 30, label = '30 min') => {
        setAdminSettings(prev => ({ ...prev, maintenanceMode: enabled }));
        try {
            const payload = enabled ? { enabled: true, durationMins } : { enabled: false };
            const { data } = await api.post('/auth/maintenance/', payload);
            applyMaintenanceState(data);
            flashMessage(enabled
                ? `Maintenance mode enabled for ${label}. Students & Faculty are now blocked.`
                : 'Maintenance mode disabled.', 5000);
        } catch {
            flashMessage(enabled ? 'Error: Failed to enable maintenance mode.' : 'Error: Failed to disable maintenance mode.', 5000);
            refreshMaintenance();
        }
    }, [applyMaintenanceState, flashMessage, refreshMaintenance, setAdminSettings]);

    // Self-source the user count (System info) so this tab no longer depends
    // on the Settings page wiring user-management state.
    useEffect(() => {
        api.get('/users/stats/').then(res => setUserCount(res.data?.total ?? null)).catch(() => { });
    }, []);

    useEffect(() => {
        refreshMaintenance();
    }, [refreshMaintenance]);

    return (
        <AdminOnly showAccessDenied>
            <div className="space-y-6">
                <SettingsGroup icon={Shield} title="System controls" description="Control who can sign in and which features are open">
                    <SettingCard
                        icon={Shield}
                        title="Maintenance mode"
                        description="Block Students & Faculty — only Staff and Admin can access"
                        control={
                            <Toggle
                                checked={adminSettings.maintenanceMode}
                                aria-label="Maintenance mode"
                                onChange={(enabled) => updateMaintenance(enabled)}
                            />
                        }
                    />
                    {adminSettings.maintenanceMode && (
                        <SettingCard
                            icon={Clock}
                            title="Maintenance duration"
                            description="Pick a preset or enter a custom length"
                            expandable
                            defaultOpen
                        >
                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { label: '30 min', mins: 30 },
                                        { label: '1 hour', mins: 60 },
                                        { label: '2 hours', mins: 120 },
                                        { label: '4 hours', mins: 240 },
                                        { label: '8 hours', mins: 480 },
                                    ].map(opt => (
                                        <button
                                            key={opt.mins}
                                            type="button"
                                            onClick={() => updateMaintenance(true, opt.mins, opt.label)}
                                            className="px-3 py-1.5 text-sm rounded-lg bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-700/40 transition-colors font-medium"
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="number"
                                        min="1"
                                        max="1440"
                                        placeholder="Custom minutes"
                                        className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent/40"
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Enter') {
                                                const mins = parseInt(e.target.value, 10);
                                                if (mins > 0) {
                                                    updateMaintenance(true, mins, `${mins} minute(s)`);
                                                    e.target.value = '';
                                                }
                                            }
                                        }}
                                    />
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Press Enter to set</span>
                                </div>
                                <MaintenanceStatus endTime={maintenanceEndTime} />
                            </div>
                        </SettingCard>
                    )}

                    <SettingCard
                        icon={UserPlus}
                        title="Allow registration"
                        description="Allow new users to register (requires backend enforcement)"
                        wip
                        control={<Toggle checked={adminSettings.allowRegistration} disabled aria-label="Allow registration" />}
                    />

                    <SettingCard
                        icon={Envelope}
                        title="Require email verification"
                        description="Requires SMTP configuration in Django settings"
                        wip
                        control={<Toggle checked={adminSettings.requireEmailVerification} disabled aria-label="Require email verification" />}
                    />
                </SettingsGroup>

                <SettingsGroup icon={Download} title="Backups" description="Schedule automatic backups or download one on demand">
                    <SettingCard
                        icon={Database}
                        title="Automatic backups"
                        description="Automatically backup database (requires backend scheduler)"
                        wip
                        control={<Toggle checked={false} disabled aria-label="Automatic backups" />}
                    />
                    {adminSettings.autoBackup && (
                        <SettingCard
                            icon={Clock}
                            title="Backup schedule"
                            description="Frequency and retention window"
                            expandable
                            defaultOpen
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frequency</label>
                                    <select
                                        value={adminSettings.backupFrequency}
                                        onChange={(e) => setAdminSettings({ ...adminSettings, backupFrequency: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent/40"
                                    >
                                        <option value="hourly">Hourly</option>
                                        <option value="daily">Daily</option>
                                        <option value="weekly">Weekly</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Retention (days)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="365"
                                        value={adminSettings.retentionDays}
                                        onChange={(e) => setAdminSettings({ ...adminSettings, retentionDays: parseInt(e.target.value) || 30 })}
                                        className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm outline-none focus:ring-2 focus:ring-accent/40"
                                    />
                                </div>
                            </div>
                        </SettingCard>
                    )}
                    <SettingCard
                        icon={Download}
                        title="Download backup now"
                        description="Export the current database as a JSON file"
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                icon={Download}
                                onClick={handleBackupNow}
                                disabled={backupLoading}
                            >
                                {backupLoading ? 'Backing up…' : 'Backup'}
                            </Button>
                        }
                    />
                    <SettingCard
                        icon={Info}
                        title="Restoring a backup"
                        description="Import the JSON file through the Django admin panel or contact your system administrator"
                    />
                </SettingsGroup>

                <SettingsGroup icon={Info} title="System information">
                    <SettingCard
                        icon={HardDrives}
                        title="Version"
                        description="Build identifier deployed to this environment"
                        control={<span className="text-sm font-mono text-gray-800 dark:text-gray-200">1.0.0</span>}
                    />
                    <SettingCard
                        icon={Info}
                        title="Environment"
                        description="Runtime mode reported by the build"
                        control={
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${env === 'production'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                }`}>
                                {env}
                            </span>
                        }
                    />
                    <SettingCard
                        icon={UserPlus}
                        title="Total users"
                        description="Registered accounts across all roles"
                        control={<span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{userCount ?? '—'}</span>}
                    />
                    <SettingCard
                        icon={Database}
                        title="Database"
                        description="Connection status to the primary database"
                        control={
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                <CheckCircle size={12} weight="fill" />
                                Connected
                            </span>
                        }
                    />
                </SettingsGroup>

                <SettingsGroup icon={ArrowsClockwise} title="Quick actions">
                    <SettingCard
                        icon={Download}
                        title="Export all data"
                        description="Inventory, requests, and users in one CSV"
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                icon={Download}
                                onClick={async () => {
                                    try {
                                        const [inv, req, usr] = await Promise.all([
                                            api.get('/inventory/items/'),
                                            api.get('/requests/'),
                                            api.get('/users/'),
                                        ]);
                                        const items = inv.data?.results || inv.data || [];
                                        const reqs = req.data?.results || req.data || [];
                                        const usrs = usr.data?.results || usr.data || [];
                                        const headers = ['Type', 'Name/Subject', 'Status', 'Category/Role', 'Date'];
                                        const rows = [
                                            ...items.map(i => ['Inventory', i.name, i.status, i.category, i.createdAt || i.created_at || '']),
                                            ...reqs.map(r => ['Request', r.itemName || r.item_name || '', r.status, r.priority, r.createdAt || r.created_at || '']),
                                            ...usrs.map(u => ['User', `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username, u.isActive ? 'Active' : 'Inactive', u.role, u.dateJoined || u.date_joined || '']),
                                        ];
                                        await exportCSV('PLMun_All_Data_Export', headers, rows);
                                        flashMessage('✓ Data exported successfully!');
                                    } catch {
                                        flashMessage('✗ Export failed. Please try again.', 5000);
                                    }
                                }}
                            >
                                Export
                            </Button>
                        }
                    />
                    <SettingCard
                        icon={Envelope}
                        title="Email service"
                        description="Not yet configured — add SMTP settings to Django settings.py"
                        control={
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                <Warning size={12} weight="fill" />
                                Not configured
                            </span>
                        }
                    />
                    <SettingCard
                        icon={Broom}
                        title="Clear local cache"
                        description="Removes locally-stored preferences and reloads the app"
                        control={
                            <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/50"
                                onClick={() => {
                                    const keys = Object.keys(localStorage).filter(k =>
                                        k.startsWith('plmun-') || k.startsWith('user-prefs-') ||
                                        k.startsWith('notif-prefs-') || k.startsWith('faculty-prefs-') ||
                                        k.startsWith('staff-prefs-') || k.startsWith('admin-prefs-') ||
                                        k.startsWith('ui-prefs-') || k === 'sys-settings'
                                    );
                                    keys.forEach(k => localStorage.removeItem(k));
                                    flashMessage(`✓ Cache cleared! Removed ${keys.length} cached setting(s). Reloading...`);
                                    setTimeout(() => window.location.reload(), 1500);
                                }}
                            >
                                Clear cache
                            </Button>
                        }
                    />
                </SettingsGroup>

                <div className="flex justify-end">
                    <Button onClick={() => saveSettings(adminPrefsKey, adminSettings, 'Admin settings')} icon={Save}>
                        Save settings
                    </Button>
                </div>
            </div>
        </AdminOnly>
    );
};

export default AdminTab;
