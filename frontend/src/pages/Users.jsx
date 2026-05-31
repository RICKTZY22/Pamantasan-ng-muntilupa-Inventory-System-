import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    MagnifyingGlass as Search, Users as UsersIcon, DownloadSimple as Download, FileText,
    UserCheck, UserMinus as UserX, Warning as AlertTriangle, Plus, Trash as Trash2,
} from '@phosphor-icons/react';
import { Button, Input, Modal } from '../components/ui';
import { StatChip } from '../components/dashboard';
import { UserCard, CreateUserModal } from '../components/users';
import { AdminOnly } from '../components/auth';
import useUsers from '../hooks/useUsers';
import { ROLES, getRoleLabel } from '../utils/roles';
import { exportCSV, exportPDF } from '../utils/exportUtils';

const ROLE_FILTERS = [
    { key: 'ALL', label: 'All' },
    { key: ROLES.STUDENT, label: 'Students' },
    { key: ROLES.FACULTY, label: 'Faculty' },
    { key: ROLES.STAFF, label: 'Staff' },
    { key: ROLES.ADMIN, label: 'Admins' },
];

const Users = () => {
    const { users, loading, stats, fetchUsers, updateUserRole, toggleUserStatus, deleteUser: deleteUserAPI, unflagUser } = useUsers();
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL'); // ALL | ACTIVE | INACTIVE | FLAGGED
    const [showCreate, setShowCreate] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [toast, setToast] = useState(null); // { type, msg }
    const toastTimer = useRef(null);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);
    useEffect(() => () => window.clearTimeout(toastTimer.current), []);

    const flash = (msg, type = 'success') => {
        setToast({ msg, type });
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 3500);
    };

    const roleCounts = useMemo(() => {
        const c = {};
        users.forEach((u) => { c[u.role] = (c[u.role] || 0) + 1; });
        return c;
    }, [users]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter((u) => {
            const active = u.isActive ?? u.is_active;
            const matchSearch = !q
                || (u.fullName || u.full_name || '').toLowerCase().includes(q)
                || (u.email || '').toLowerCase().includes(q)
                || (u.department || '').toLowerCase().includes(q);
            const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
            const matchStatus = statusFilter === 'ALL'
                || (statusFilter === 'ACTIVE' && active)
                || (statusFilter === 'INACTIVE' && !active)
                || (statusFilter === 'FLAGGED' && u.isFlagged);
            return matchSearch && matchRole && matchStatus;
        });
    }, [users, search, roleFilter, statusFilter]);

    // ── action handlers (wrap useUsers + surface a toast) ──
    const handleRoleChange = async (id, role) => {
        const r = await updateUserRole(id, role);
        flash(r.success ? `Role updated to ${getRoleLabel(role)}` : `✗ ${r.error}`, r.success ? 'success' : 'error');
    };
    const handleToggleStatus = async (id) => {
        const r = await toggleUserStatus(id);
        flash(r.success ? (r.message || 'Status updated') : `✗ ${r.error}`, r.success ? 'success' : 'error');
    };
    const handleUnflag = async (id) => {
        const r = await unflagUser(id);
        flash(r.success ? (r.message || 'User unflagged') : `✗ ${r.error}`, r.success ? 'success' : 'error');
    };
    const handleDelete = async () => {
        if (!deleteTarget) return;
        const r = await deleteUserAPI(deleteTarget.id);
        flash(r.success ? `Deleted ${deleteTarget.fullName || deleteTarget.email}` : `✗ ${r.error}`, r.success ? 'success' : 'error');
        setDeleteTarget(null);
    };

    // ── exports (preserve original behavior) ──
    const csvRows = () => users.map((u) => [
        u.fullName || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
        u.email, u.studentId || u.student_id || '', getRoleLabel(u.role), u.department || '',
        (u.isActive ?? u.is_active) ? 'Active' : 'Inactive',
        u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '',
        u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never',
    ]);
    const onExportCSV = () => exportCSV('users', ['Name', 'Email', 'Student ID', 'Role', 'Department', 'Status', 'Date Joined', 'Last Login'], csvRows());
    const onExportPDF = () => exportPDF('users_report', 'PLMun User Management Report',
        ['Name', 'Email', 'Student ID', 'Role', 'Department', 'Status', 'Last Login'],
        users.map((u) => [
            u.fullName || u.username, u.email, u.studentId || u.student_id || '', getRoleLabel(u.role),
            u.department || '', (u.isActive ?? u.is_active) ? 'Active' : 'Inactive',
            u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never',
        ]),
        { summary: { 'Total Users': stats.total, Active: stats.active, Inactive: stats.inactive, Admins: stats.admins, Staff: stats.staff } });

    return (
        <AdminOnly showAccessDenied>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-semibold tracking-wide uppercase text-gray-400 dark:text-gray-500">Management</p>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">User Management</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" icon={Download} onClick={onExportCSV}>CSV</Button>
                        <Button variant="secondary" size="sm" icon={FileText} onClick={onExportPDF}>PDF</Button>
                        <Button icon={Plus} onClick={() => setShowCreate(true)}>Add User</Button>
                    </div>
                </div>

                {/* Stat chips (click to filter by status) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatChip icon={UsersIcon} value={stats.total} label="Total Users" tone="blue" onClick={() => setStatusFilter('ALL')} />
                    <StatChip icon={UserCheck} value={stats.active} label="Active" tone="emerald" onClick={() => setStatusFilter('ACTIVE')} />
                    <StatChip icon={UserX} value={stats.inactive} label="Inactive" tone="gray" onClick={() => setStatusFilter('INACTIVE')} />
                    <StatChip icon={AlertTriangle} value={stats.flagged} label="Flagged" tone={stats.flagged > 0 ? 'red' : 'gray'} onClick={() => setStatusFilter('FLAGGED')} />
                </div>

                {/* Search + role filter chips */}
                <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
                    <div className="flex-1">
                        <Input icon={Search} placeholder="Search by name, email, or department..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {ROLE_FILTERS.map((rf) => {
                            const activeChip = roleFilter === rf.key;
                            const count = rf.key === 'ALL' ? users.length : (roleCounts[rf.key] || 0);
                            return (
                                <button
                                    key={rf.key}
                                    onClick={() => setRoleFilter(rf.key)}
                                    aria-pressed={activeChip}
                                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 ${activeChip
                                        ? 'bg-accent text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                >
                                    {rf.label}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${activeChip ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {(statusFilter !== 'ALL' || roleFilter !== 'ALL' || search) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
                        Showing {filtered.length} of {users.length}
                        {statusFilter !== 'ALL' && <> · <button onClick={() => setStatusFilter('ALL')} className="text-[var(--accent)] hover:underline">{statusFilter.toLowerCase()}</button></>}
                    </p>
                )}

                {/* Grid */}
                {loading && users.length === 0 ? (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="h-64 rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-gray-50 dark:bg-gray-800/40 animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40">
                        <UsersIcon size={40} weight="duotone" className="text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 font-medium">No users match your filters</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try a different search or filter.</p>
                    </div>
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {filtered.map((u) => (
                            <UserCard
                                key={u.id}
                                user={u}
                                onChangeRole={handleRoleChange}
                                onToggleStatus={handleToggleStatus}
                                onUnflag={handleUnflag}
                                onDelete={setDeleteTarget}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50">
                    <div className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg border ${toast.type === 'error'
                        ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300'
                        : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'}`}>
                        {toast.msg}
                    </div>
                </div>
            )}

            {/* Create modal */}
            <CreateUserModal
                isOpen={showCreate}
                onClose={() => setShowCreate(false)}
                onCreated={(msg) => { flash(msg); fetchUsers(); }}
            />

            {/* Delete confirm modal */}
            <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete User Account">
                <div>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center flex-shrink-0">
                            <Trash2 className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-800 dark:text-white">Are you sure?</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone.</p>
                        </div>
                    </div>
                    {deleteTarget && (
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Deleting <span className="font-semibold">{deleteTarget.fullName || deleteTarget.email}</span> ({deleteTarget.email}).
                            </p>
                        </div>
                    )}
                    <div className="flex gap-3 justify-end">
                        <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
                        <Button variant="danger" icon={Trash2} onClick={handleDelete}>Delete Account</Button>
                    </div>
                </div>
            </Modal>
        </AdminOnly>
    );
};

export default Users;
