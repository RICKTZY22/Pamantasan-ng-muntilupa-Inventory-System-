import React, { useState, useEffect } from 'react';
import {
    User,
    Shield,
    CaretRight as ChevronRight,
    Wrench,
    Bell,
    Palette,
    Users,
    Lock,
    GraduationCap,
    Briefcase,
    SlidersHorizontal as Sliders,
    Envelope as Mail,
    Buildings as Building,
    Plus,
    Trash as Trash2,
    Warning as AlertTriangle,
    ArrowLeft,
    SignOut as LogOut,
    ClockCounterClockwise as History,
    GearSix as SettingsIcon,
    MagnifyingGlass as Search,
    X
} from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { Button, Input, Modal, PasswordStrengthMeter } from '../components/ui';
import { isPlmunEmail } from '../utils/validators';
import useAuthStore from '../store/authStore';
import useUIStore from '../store/uiStore';
import { useUsers } from '../hooks';
import { useIsMobile } from '../hooks';
import { ROLES } from '../utils/roles';
import { formatApiError } from '../utils/errorUtils';
import { exportPDF } from '../utils/exportUtils';
import api from '../services/api';
import ProfileTab from './settings/ProfileTab';
import SecurityTab from './settings/SecurityTab';
import NotificationsTab from './settings/NotificationsTab';
import AppearanceTab from './settings/AppearanceTab';
import FacultyTab from './settings/FacultyTab';
import StaffTab from './settings/StaffTab';
import SystemTab from './settings/SystemTab';
import UsersTab from './settings/UsersTab';
import AdminTab from './settings/AdminTab';
import HistoryTab from './settings/HistoryTab';
import PreferencesTab from './settings/PreferencesTab';

// tabs ng settings - depende sa role kung anong makikita
const settingsTabs = [
    { id: 'profile', label: 'Profile', icon: User, minRole: null, desc: 'Your personal information and photo' },
    { id: 'preferences', label: 'Preferences', icon: Sliders, minRole: null, desc: 'Request defaults, display, and reminders' },
    { id: 'security', label: 'Security', icon: Lock, minRole: null, desc: 'Manage your password' },
    { id: 'notifications', label: 'Notifications', icon: Bell, minRole: null, desc: 'Choose what you get notified about' },
    { id: 'appearance', label: 'Appearance', icon: Palette, minRole: null, desc: 'Theme, accent color, and effects' },
    { id: 'faculty', label: 'Faculty', icon: GraduationCap, exactRole: 'FACULTY', desc: 'Teaching department and borrowing limits' },
    { id: 'staff', label: 'Inventory', icon: Briefcase, minRole: ROLES.STAFF, desc: 'Defaults for managing inventory' },
    { id: 'system', label: 'System', icon: Wrench, minRole: ROLES.STAFF, desc: 'Categories and item conditions' },
    { id: 'history', label: 'History & Flags', icon: History, minRole: ROLES.STAFF, desc: 'Request history and flagged accounts' },
    { id: 'users', label: 'Users', icon: Users, minRole: ROLES.ADMIN, desc: 'Create and manage user accounts' },
    { id: 'admin', label: 'Administration', icon: Shield, minRole: ROLES.ADMIN, desc: 'Maintenance, audit logs, and backups' },
];

const MotionDiv = motion.div;

const Settings = () => {
    const { user, updateProfile, updateAvatar, changePassword, isLoading, hasMinRole, logout } = useAuthStore();
    const { theme, setTheme, backgroundEffect, setBackgroundEffect, viewMode, setViewMode, itemsPerPage, setItemsPerPage, showImages, setShowImages } = useUIStore();
    const { users, loading: usersLoading, fetchUsers, updateUserRole, toggleUserStatus, deleteUser: deleteUserAPI, unflagUser } = useUsers();
    const isMobile = useIsMobile();
    const reduce = useReducedMotion();
    // sa mobile: null = menu list, string = tab content
    const [activeTab, setActiveTab] = useState(isMobile ? null : 'profile');
    const [navQuery, setNavQuery] = useState('');

    // Sync activeTab when screen size changes
    useEffect(() => {
        if (isMobile && activeTab === 'profile') {
            // Reset to menu on mobile so user sees all options
            setActiveTab(null);
        } else if (!isMobile && activeTab === null) {
            // On desktop, always show a tab
            setActiveTab('profile');
        }
        // Intentionally runs only on viewport change; adding activeTab would
        // reset the open tab on every navigation.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMobile]);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [createUserForm, setCreateUserForm] = useState({
        fullName: '', email: '', username: '', password: '', password2: '',
        role: 'STUDENT', department: '',
    });
    const [createUserError, setCreateUserError] = useState('');
    const [createUserLoading, setCreateUserLoading] = useState(false);

    // fetch users pag binuksan yung admin tab
    useEffect(() => {
        if (activeTab === 'users' && hasMinRole(ROLES.ADMIN)) {
            fetchUsers();
        }
    }, [activeTab, fetchUsers, hasMinRole]);

    // i-filter yung tabs based sa role
    const visibleTabs = settingsTabs.filter(tab => {
        if (tab.exactRole) return user?.role === tab.exactRole;
        if (!tab.minRole) return true;
        return hasMinRole(tab.minRole);
    });

    // Search filter for the sidebar (matches label + description)
    const q = navQuery.trim().toLowerCase();
    const filteredTabs = q
        ? visibleTabs.filter(t =>
            t.label.toLowerCase().includes(q) ||
            (t.desc && t.desc.toLowerCase().includes(q))
        )
        : visibleTabs;

    // Profile form state
    const [profileForm, setProfileForm] = useState({
        fullName: user?.fullName || '',
        email: user?.email || '',
        phone: user?.phone || '',
        department: user?.department || '',
    });

    // Password form state
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });
    // System settings state - matches backend Item.Category choices
    const defaultCategories = ['Electronics', 'Furniture', 'Equipment', 'Supplies', 'Other'];
    const defaultConditions = ['Available', 'In Use', 'Maintenance', 'Retired'];
    const [categories, setCategories] = useState(defaultCategories);
    const [conditions, setConditions] = useState(defaultConditions);
    const [newCategory, setNewCategory] = useState('');
    const [newCondition, setNewCondition] = useState('');
    const [editingCategory, setEditingCategory] = useState(null);
    const [editingCondition, setEditingCondition] = useState(null);

    // Helper: per-user storage key
    const prefsKey = user?.id ? `user-prefs-${user.id}` : null;
    const notifPrefsKey = user?.id ? `notif-prefs-${user.id}` : null;
    const facultyPrefsKey = user?.id ? `faculty-prefs-${user.id}` : null;
    const staffPrefsKey = user?.id ? `staff-prefs-${user.id}` : null;
    const adminPrefsKey = user?.id ? `admin-prefs-${user.id}` : null;

    // Student/User Preferences state
    const [preferences, setPreferences] = useState({
        // Request defaults
        defaultQuantity: 1,
        defaultPurpose: '',
        // Display preferences
        viewMode: 'table',
        itemsPerPage: 10,
        showImages: true,
        // Reminder settings
        dueDateReminder: true,
        reminderDays: 2,
        autoRenewRequests: false,
    });

    // Notification preferences state
    const [notifPrefs, setNotifPrefs] = useState({
        emailNewRequests: true,
        emailApprovals: true,
        emailInventory: false,
        browserPush: true,
        weeklySummary: false,
    });

    // Faculty settings state
    const [facultySettings, setFacultySettings] = useState({
        department: user?.department || '',
        courses: [],
        maxBorrowItems: 10,
        maxBorrowDays: 14,
        autoApproveOwnStudents: false,
        requireJustification: true,
    });

    // Staff settings state
    const [staffSettings, setStaffSettings] = useState({
        defaultCategory: 'Electronics',
        defaultLocation: '',
        defaultStatus: 'AVAILABLE',
        reportFormat: 'pdf',
        autoGenerateReports: false,
        reportSchedule: 'weekly',
    });

    // Admin settings state
    const [adminSettings, setAdminSettings] = useState({
        maintenanceMode: false,
        allowRegistration: true,
        requireEmailVerification: false,
        autoBackup: true,
        backupFrequency: 'daily',
        retentionDays: 30,
    });

    // flash message helper — replaces previous message with a unique key so React
    // always re-mounts the notification (fixes overlap/no-animation on rapid clicks)
    const [saveMessage, setSaveMessage] = useState('');
    const [saveMessageKey, setSaveMessageKey] = useState(0);
    const flashTimerRef = React.useRef(null);
    const flashMessage = React.useCallback((msg, ms = 3000) => {
        clearTimeout(flashTimerRef.current);
        setSaveMessage(msg);
        setSaveMessageKey(k => k + 1);
        flashTimerRef.current = setTimeout(() => setSaveMessage(''), ms);
    }, []);
    const [backupLoading, setBackupLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [unflagConfirmId, setUnflagConfirmId] = useState(null);

    // Load all saved settings from localStorage on mount
    useEffect(() => {
        if (!user?.id) return;

        try {
            const savedPrefs = localStorage.getItem(prefsKey);
            if (savedPrefs) setPreferences(prev => ({ ...prev, ...JSON.parse(savedPrefs) }));

            const savedNotif = localStorage.getItem(notifPrefsKey);
            if (savedNotif) setNotifPrefs(prev => ({ ...prev, ...JSON.parse(savedNotif) }));

            const savedFaculty = localStorage.getItem(facultyPrefsKey);
            if (savedFaculty) setFacultySettings(prev => ({ ...prev, ...JSON.parse(savedFaculty) }));

            const savedStaff = localStorage.getItem(staffPrefsKey);
            if (savedStaff) setStaffSettings(prev => ({ ...prev, ...JSON.parse(savedStaff) }));

            const savedAdmin = localStorage.getItem(adminPrefsKey);
            if (savedAdmin) setAdminSettings(prev => ({ ...prev, ...JSON.parse(savedAdmin) }));

            // Load system categories/conditions
            const savedSys = localStorage.getItem('sys-settings');
            if (savedSys) {
                const parsed = JSON.parse(savedSys);
                if (parsed.categories?.length) setCategories(parsed.categories);
                if (parsed.conditions?.length) setConditions(parsed.conditions);
            }
        } catch {
            // failed to load settings — use defaults
        }
    }, [adminPrefsKey, facultyPrefsKey, notifPrefsKey, prefsKey, staffPrefsKey, user?.id]);

    // Save settings helper
    const saveSettings = (key, data, label) => {
        if (!key) return;
        try {
            localStorage.setItem(key, JSON.stringify(data));
            flashMessage(`${label} saved successfully!`);
        } catch {
            flashMessage('Failed to save settings');
        }
    };

    // audit logs - admin only
    // TODO: lagyan ng search/filter yung audit logs kasi ang hirap maghanap pag madami na
    const [auditLogs, setAuditLogs] = useState([]);
    const [auditLogsLoading, setAuditLogsLoading] = useState(false);
    const [clearLogsConfirm, setClearLogsConfirm] = useState(false);

    const fetchAuditLogs = async () => {
        try {
            setAuditLogsLoading(true);
            const { data } = await api.get('/auth/audit-logs/?limit=200');
            setAuditLogs(data);
        } catch (err) {
            // audit log fetch failed — non-critical
        } finally {
            setAuditLogsLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'admin') fetchAuditLogs();
    }, [activeTab]);

    // daily auto-export ng audit logs sa PDF kapag binuksan ng admin
    useEffect(() => {
        if (activeTab !== 'admin' || auditLogs.length === 0) return;
        const lastExportKey = 'audit-last-auto-export';
        const lastExport = localStorage.getItem(lastExportKey);
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;
        if (lastExport && (now - parseInt(lastExport, 10)) < ONE_DAY) return;

        // Auto-export
        const headers = ['Action', 'User', 'Details', 'IP Address', 'Timestamp'];
        const rows = auditLogs.map(l => [
            l.action, l.user || '—', l.details || '—', l.ip_address || '—',
            new Date(l.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
        ]);
        exportPDF('PLMun_Audit_Logs', 'Audit Log Report — Auto Export', headers, rows);
        localStorage.setItem(lastExportKey, String(now));
        flashMessage('✓ Daily audit log report exported automatically.', 4000);
    }, [activeTab, auditLogs, flashMessage]);

    const handleClearAuditLogs = async () => {
        try {
            const { data } = await api.delete('/auth/audit-logs/');
            flashMessage('✓ ' + (data.message || 'Audit logs cleared.'));
            fetchAuditLogs();
        } catch (err) {
            flashMessage('✗ ' + formatApiError(err, 'Failed to clear logs'), 5000);
        }
        setClearLogsConfirm(false);
    };

    const handleExportAuditLogs = () => {
        const headers = ['Action', 'User', 'Details', 'IP Address', 'Timestamp'];
        const rows = auditLogs.map(l => [
            l.action, l.user || '—', l.details || '—', l.ip_address || '—',
            new Date(l.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }),
        ]);
        exportPDF('PLMun_Audit_Logs', 'Audit Log Report', headers, rows);
        localStorage.setItem('audit-last-auto-export', String(Date.now()));
    };

    const handleCreateUser = async () => {
        setCreateUserError('');
        const { fullName, email, username, password, password2, role, department } = createUserForm;
        if (!fullName || !email || !username || !password) {
            setCreateUserError('Full name, email, username, and password are required.');
            return;
        }
        if (password !== password2) {
            setCreateUserError('Passwords do not match.');
            return;
        }
        if (!email.trim().toLowerCase().endsWith('@plmun.edu.ph')) {
            setCreateUserError('Only @plmun.edu.ph email addresses are allowed.');
            return;
        }
        if (password.length < 6) {
            setCreateUserError('Password must be at least 6 characters.');
            return;
        }
        try {
            setCreateUserLoading(true);
            await api.post('/auth/register/', { fullName, email, username, password, password2, role, department });
            flashMessage(`✓ Account created for ${fullName} (${role})`, 4000);
            setShowCreateUserModal(false);
            setCreateUserForm({ fullName: '', email: '', username: '', password: '', password2: '', role: 'STUDENT', department: '' });
            fetchUsers();
        } catch (err) {
            const msg = formatApiError(err, 'Failed to create account.');
            setCreateUserError(msg || 'Failed to create account.');
        } finally {
            setCreateUserLoading(false);
        }
    };

    const handleProfileSave = async () => {
        await updateProfile(profileForm);
    };

    const handlePasswordChange = async () => {
        setPasswordError('');
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError('Passwords do not match!');
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            setPasswordError('Password must be at least 6 characters.');
            return;
        }
        await changePassword(passwordForm);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    };

    const handleToggleUserStatus = async (userId) => {
        await toggleUserStatus(userId);
    };

    const handleDeleteUser = async (userId) => {
        await deleteUserAPI(userId);
        setShowDeleteModal(false);
        setSelectedUser(null);
    };

    const handleRoleChange = async (userId, newRole) => {
        await updateUserRole(userId, newRole);
    };

    const handleUnflagUser = async (userId) => {
        const result = await unflagUser(userId);
        if (result.success) {
            flashMessage(result.message || 'User unflagged successfully!');
            fetchUsers();
        } else {
            flashMessage(`✗ Failed to unflag user: ${result.error}`, 5000);
        }
        setUnflagConfirmId(null);
    };

    const handleBackupNow = async () => {
        if (backupLoading) return;
        setBackupLoading(true);
        flashMessage('');
        try {
            const response = await api.get('/auth/backup/', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/json' }));
            const link = document.createElement('a');
            const now = new Date();
            const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            link.href = url;
            link.setAttribute('download', `plmun_nexus_backup_${ts}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            flashMessage('✓ Backup downloaded successfully!', 5000);
        } catch (err) {
            const msg = formatApiError(err, 'Backup failed');
            flashMessage(`✗ Backup failed: ${msg}`, 5000);
        } finally {
            setBackupLoading(false);
        }
    };

    const renderTabContent = () => {
        switch (activeTab || 'profile') {
            case 'profile':
                return (
                    <ProfileTab
                        user={user}
                        profileForm={profileForm}
                        setProfileForm={setProfileForm}
                        handleProfileSave={handleProfileSave}
                        updateAvatar={updateAvatar}
                        isLoading={isLoading}
                    />
                );

            case 'preferences':
                return (
                    <PreferencesTab
                        preferences={preferences}
                        setPreferences={setPreferences}
                        saveMessage={saveMessage}
                        saveSettings={saveSettings}
                        prefsKey={prefsKey}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        itemsPerPage={itemsPerPage}
                        setItemsPerPage={setItemsPerPage}
                        showImages={showImages}
                        setShowImages={setShowImages}
                    />
                );

            case 'security':
                return (
                    <SecurityTab
                        passwordForm={passwordForm}
                        setPasswordForm={setPasswordForm}
                        passwordError={passwordError}
                        setPasswordError={setPasswordError}
                        handlePasswordChange={handlePasswordChange}
                        isLoading={isLoading}
                    />
                );

            case 'notifications':
                return (
                    <NotificationsTab
                        notifPrefs={notifPrefs}
                        setNotifPrefs={setNotifPrefs}
                        saveMessage={saveMessage}
                        saveSettings={saveSettings}
                        notifPrefsKey={notifPrefsKey}
                    />
                );

            case 'appearance':
                return (
                    <AppearanceTab
                        theme={theme}
                        setTheme={setTheme}
                        backgroundEffect={backgroundEffect}
                        setBackgroundEffect={setBackgroundEffect}
                    />
                );

            case 'faculty':
                return (
                    <FacultyTab
                        facultySettings={facultySettings}
                        setFacultySettings={setFacultySettings}
                        saveSettings={saveSettings}
                        facultyPrefsKey={facultyPrefsKey}
                    />
                );

            case 'staff':
                return (
                    <StaffTab
                        staffSettings={staffSettings}
                        setStaffSettings={setStaffSettings}
                        categories={categories}
                        saveSettings={saveSettings}
                        staffPrefsKey={staffPrefsKey}
                    />
                );

            case 'system':
                return (
                    <SystemTab
                        categories={categories}
                        setCategories={setCategories}
                        conditions={conditions}
                        setConditions={setConditions}
                        editingCategory={editingCategory}
                        setEditingCategory={setEditingCategory}
                        editingCondition={editingCondition}
                        setEditingCondition={setEditingCondition}
                        newCategory={newCategory}
                        setNewCategory={setNewCategory}
                        newCondition={newCondition}
                        setNewCondition={setNewCondition}
                        flashMessage={flashMessage}
                    />
                );

            case 'users':
                return (
                    <UsersTab
                        users={users}
                        loading={usersLoading}
                        handleToggleUserStatus={handleToggleUserStatus}
                        handleRoleChange={handleRoleChange}
                        handleUnflagUser={handleUnflagUser}
                        setSelectedUser={setSelectedUser}
                        setShowDeleteModal={setShowDeleteModal}
                        setShowCreateUserModal={setShowCreateUserModal}
                        setCreateUserError={setCreateUserError}
                        unflagConfirmId={unflagConfirmId}
                        setUnflagConfirmId={setUnflagConfirmId}
                    />
                );

            case 'history':
                return <HistoryTab />;

            case 'admin':
                return (
                    <AdminTab
                        adminSettings={adminSettings}
                        setAdminSettings={setAdminSettings}
                        saveMessage={saveMessage}
                        flashMessage={flashMessage}
                        saveSettings={saveSettings}
                        adminPrefsKey={adminPrefsKey}
                        users={users}
                        auditLogs={auditLogs}
                        auditLogsLoading={auditLogsLoading}
                        fetchAuditLogs={fetchAuditLogs}
                        handleClearAuditLogs={handleClearAuditLogs}
                        handleExportAuditLogs={handleExportAuditLogs}
                        handleBackupNow={handleBackupNow}
                        backupLoading={backupLoading}
                        clearLogsConfirm={clearLogsConfirm}
                        setClearLogsConfirm={setClearLogsConfirm}
                    />
                );

            default:
                return null;
        }
    };

    // Semantic, dark-aware save toast (emerald success / red on a leading ✗).
    const renderToast = (className = '') => {
        if (!saveMessage) return null;
        const isErr = saveMessage.startsWith('✗');
        return (
            <div
                key={saveMessageKey}
                role="status"
                className={`px-4 py-2.5 rounded-xl text-sm font-medium animate-fade-in flex items-center gap-2 border ${className} ${isErr
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300'
                    : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
                    }`}
            >
                {saveMessage}
            </div>
        );
    };

    const renderModals = () => (
        <>
            {/* Create User Modal */}
            <Modal
                isOpen={showCreateUserModal}
                onClose={() => { setShowCreateUserModal(false); setCreateUserError(''); }}
                title="Create New Account"
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Full Name" icon={User} placeholder="Juan Dela Cruz" value={createUserForm.fullName} onChange={(e) => setCreateUserForm({ ...createUserForm, fullName: e.target.value })} autoComplete="off" />
                        <Input label="Email" icon={Mail} type="email" placeholder="juan@plmun.edu.ph" value={createUserForm.email} error={createUserForm.email && !isPlmunEmail(createUserForm.email) ? 'Use a @plmun.edu.ph email' : ''} onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })} autoComplete="off" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Username" icon={User} placeholder="juandelacruz" value={createUserForm.username} onChange={(e) => setCreateUserForm({ ...createUserForm, username: e.target.value })} autoComplete="off" />
                        <Input label="Department" icon={Building} placeholder="e.g., CIT" value={createUserForm.department} onChange={(e) => setCreateUserForm({ ...createUserForm, department: e.target.value })} autoComplete="off" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                        <select value={createUserForm.role} onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary">
                            <option value="STUDENT">Student</option>
                            <option value="FACULTY">Faculty</option>
                            <option value="STAFF">Staff</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <Input label="Password" icon={Lock} type="password" placeholder="Min 6 characters" value={createUserForm.password} onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })} />
                            <PasswordStrengthMeter password={createUserForm.password} />
                        </div>
                        <Input
                            label="Confirm Password"
                            icon={Lock}
                            type="password"
                            placeholder="Re-enter password"
                            value={createUserForm.password2}
                            error={createUserForm.password2 && createUserForm.password !== createUserForm.password2 ? 'Passwords do not match' : ''}
                            onChange={(e) => setCreateUserForm({ ...createUserForm, password2: e.target.value })}
                        />
                    </div>
                    {createUserError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">{createUserError}</p>}
                    <div className="flex gap-3 justify-end pt-2">
                        <Button variant="ghost" onClick={() => { setShowCreateUserModal(false); setCreateUserError(''); }}>Cancel</Button>
                        <Button
                            icon={Plus}
                            onClick={handleCreateUser}
                            loading={createUserLoading}
                            disabled={
                                (createUserForm.email && !isPlmunEmail(createUserForm.email)) ||
                                (createUserForm.password2 && createUserForm.password !== createUserForm.password2)
                            }
                        >
                            Create Account
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => { setShowDeleteModal(false); setSelectedUser(null); }}
                title="Delete User Account"
            >
                <div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-white">Are you sure?</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
                        </div>
                    </div>
                    {selectedUser && (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                You are about to delete the account for <span className="font-semibold">{selectedUser.fullName}</span> ({selectedUser.email}).
                            </p>
                        </div>
                    )}
                    <div className="flex gap-3 justify-end">
                        <Button variant="ghost" onClick={() => { setShowDeleteModal(false); setSelectedUser(null); }}>Cancel</Button>
                        <Button variant="danger" icon={Trash2} onClick={() => handleDeleteUser(selectedUser?.id)}>Delete Account</Button>
                    </div>
                </div>
            </Modal>
        </>
    );

    // Mobile: show menu OR detail, never both
    if (isMobile) {
        // Detail view
        if (activeTab) {
            const currentTab = visibleTabs.find(t => t.id === activeTab);
            const TabIcon = currentTab?.icon || SettingsIcon;
            return (
                <div className="animate-fade-in">
                    {/* Back header */}
                    <button
                        onClick={() => setActiveTab(null)}
                        className="flex items-center gap-2 mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="text-sm font-medium">Settings</span>
                    </button>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-accent/10 dark:bg-accent/20 flex items-center justify-center">
                            <TabIcon size={20} className="text-accent" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{currentTab?.label}</h1>
                            {currentTab?.desc && <p className="text-xs text-gray-500 dark:text-gray-400">{currentTab.desc}</p>}
                        </div>
                    </div>
                    {/* Mobile toast notification */}
                    {renderToast('mb-4')}
                    <MotionDiv
                        key={activeTab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
                    >
                        {renderTabContent()}
                    </MotionDiv>

                    {/* Modals */}
                    {renderModals()}
                </div>
            );
        }

        // Menu view
        return (
            <div className="animate-fade-in">
                <div className="mb-5">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <SettingsIcon className="text-primary" size={24} />
                        Settings
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your account and preferences</p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                    {visibleTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors active:bg-gray-100 dark:active:bg-gray-700"
                        >
                            <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                <tab.icon size={18} className="text-gray-600 dark:text-gray-300" />
                            </div>
                            <span className="flex-1 font-medium text-sm text-gray-900 dark:text-gray-100">{tab.label}</span>
                            <ChevronRight size={16} className="text-gray-400" />
                        </button>
                    ))}
                </div>

                {/* Logout — only visible on mobile */}
                <button
                    onClick={logout}
                    className="w-full flex items-center gap-3.5 px-4 py-3.5 mt-4 bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors active:bg-red-100"
                >
                    <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                        <LogOut size={18} className="text-red-500" />
                    </div>
                    <span className="flex-1 font-medium text-sm text-red-600 dark:text-red-400">Log Out</span>
                </button>

                {/* Modals */}
                {renderModals()}
            </div>
        );
    }

    // Desktop layout — Windows 11 Settings style
    const activeId = activeTab || 'profile';
    const currentTab = visibleTabs.find(t => t.id === activeId);
    const CurrentIcon = currentTab?.icon || SettingsIcon;
    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                    <SettingsIcon className="text-accent" />
                    Settings
                </h1>
                <p className="text-gray-500 dark:text-gray-400 mt-1">Manage your account and system preferences</p>
            </div>

            <div className="flex gap-6 items-start">
                {/* Nav rail */}
                <nav aria-label="Settings sections" className="w-64 flex-shrink-0 sticky top-4 rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-2">
                    {/* Edge-style search */}
                    <div className="relative px-1 pt-1 pb-2">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={navQuery}
                            onChange={(e) => setNavQuery(e.target.value)}
                            placeholder="Search settings"
                            aria-label="Search settings"
                            className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md bg-gray-100/70 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700/60 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60"
                        />
                        {navQuery && (
                            <button
                                type="button"
                                onClick={() => setNavQuery('')}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    <div className="space-y-0.5">
                        {filteredTabs.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400 text-center">No matching settings</p>
                        ) : filteredTabs.map((tab) => {
                            const selected = activeId === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-current={selected ? 'page' : undefined}
                                    className={`relative w-full flex items-center gap-3 pl-4 pr-3 py-2 rounded-md text-sm text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${selected
                                        ? 'bg-gray-100 dark:bg-gray-800 font-semibold text-gray-900 dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/70 dark:hover:bg-gray-800/60'
                                        }`}
                                >
                                    {selected && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-accent" aria-hidden="true" />}
                                    <tab.icon size={18} className={selected ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'} />
                                    <span className="truncate">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>

                {/* Content Area */}
                <div className="flex-1 min-w-0">
                    {/* Content header band */}
                    <div className="flex items-center gap-3 mb-5">
                        <span className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
                            <CurrentIcon size={18} />
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{currentTab?.label}</h2>
                            {currentTab?.desc && <p className="text-xs text-gray-500 dark:text-gray-400">{currentTab.desc}</p>}
                        </div>
                    </div>

                    {renderToast('mb-4')}

                    <MotionDiv
                        key={activeId}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
                    >
                        {renderTabContent()}
                    </MotionDiv>
                </div>
            </div>

            {/* Modals */}
            {renderModals()}
        </div>
    );
};

export default Settings;
