import React, { useState, useMemo } from 'react';
import { Plus, Trash as Trash2, UserMinus as UserX, UserCheck, Warning as AlertTriangle, ShieldCheck, MagnifyingGlass as Search, Users, Shield, GraduationCap, Briefcase, DotsThreeVertical as MoreVertical, Envelope as Mail, Buildings as Building2 } from '@phosphor-icons/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Button, Card } from '../../components/ui';
import { AdminOnly } from '../../components/auth';
import { ROLES } from '../../utils/roles';

const ROLE_META = {
    [ROLES.STUDENT]: { label: 'Student', icon: GraduationCap, gradient: 'from-blue-500 to-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
    [ROLES.FACULTY]: { label: 'Faculty', icon: Briefcase, gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300' },
    [ROLES.STAFF]: { label: 'Staff', icon: Shield, gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
    [ROLES.ADMIN]: { label: 'Admin', icon: Shield, gradient: 'from-red-500 to-red-600', bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
};

const UsersTab = ({
    users, loading, handleToggleUserStatus, handleRoleChange, handleUnflagUser,
    setSelectedUser, setShowDeleteModal, setShowCreateUserModal, setCreateUserError,
    unflagConfirmId, setUnflagConfirmId,
}) => {
    const [listRef] = useAutoAnimate();
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Filtered users
    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchSearch = !search ||
                (u.fullName || u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
                (u.email || '').toLowerCase().includes(search.toLowerCase()) ||
                (u.department || '').toLowerCase().includes(search.toLowerCase());
            const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
            const matchStatus = statusFilter === 'ALL' ||
                (statusFilter === 'ACTIVE' && u.isActive) ||
                (statusFilter === 'INACTIVE' && !u.isActive) ||
                (statusFilter === 'FLAGGED' && u.isFlagged);
            return matchSearch && matchRole && matchStatus;
        });
    }, [users, search, roleFilter, statusFilter]);

    // Stats
    const stats = useMemo(() => ({
        total: users.length,
        active: users.filter(u => u.isActive).length,
        inactive: users.filter(u => !u.isActive).length,
        flagged: users.filter(u => u.isFlagged).length,
    }), [users]);

    const roleCounts = useMemo(() => {
        const counts = {};
        users.forEach(u => { counts[u.role] = (counts[u.role] || 0) + 1; });
        return counts;
    }, [users]);

    return (
        <AdminOnly showAccessDenied>
            <div className="space-y-6">
                {/* Action row */}
                <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {stats.total} user{stats.total !== 1 ? 's' : ''} · {stats.active} active
                    </p>
                    <Button icon={Plus} onClick={() => { setShowCreateUserModal(true); setCreateUserError(''); }}>
                        Add User
                    </Button>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <button onClick={() => setStatusFilter('ALL')} className={`p-3 rounded-xl border transition-all ${statusFilter === 'ALL' ? 'border-primary bg-primary/5 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Users size={18} className="text-primary" />
                            </div>
                            <div className="text-left">
                                <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.total}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Total Users</p>
                            </div>
                        </div>
                    </button>
                    <button onClick={() => setStatusFilter('ACTIVE')} className={`p-3 rounded-xl border transition-all ${statusFilter === 'ACTIVE' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/10 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <UserCheck size={18} className="text-emerald-600" />
                            </div>
                            <div className="text-left">
                                <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.active}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Active</p>
                            </div>
                        </div>
                    </button>
                    <button onClick={() => setStatusFilter('INACTIVE')} className={`p-3 rounded-xl border transition-all ${statusFilter === 'INACTIVE' ? 'border-gray-500 bg-gray-50 dark:bg-gray-800 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                <UserX size={18} className="text-gray-500" />
                            </div>
                            <div className="text-left">
                                <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.inactive}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Inactive</p>
                            </div>
                        </div>
                    </button>
                    <button onClick={() => setStatusFilter('FLAGGED')} className={`p-3 rounded-xl border transition-all ${statusFilter === 'FLAGGED' ? 'border-red-500 bg-red-50 dark:bg-red-900/10 shadow-sm' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <AlertTriangle size={18} className="text-red-600" />
                            </div>
                            <div className="text-left">
                                <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.flagged}</p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400">Flagged</p>
                            </div>
                        </div>
                    </button>
                </div>

                {/* Search + Role Filter */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, email, or department..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition-all"
                        />
                    </div>
                    <div className="flex gap-2">
                        {['ALL', ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN].map(role => {
                            const meta = role === 'ALL' ? null : ROLE_META[role];
                            const count = role === 'ALL' ? users.length : (roleCounts[role] || 0);
                            const isActive = roleFilter === role;
                            return (
                                <button
                                    key={role}
                                    onClick={() => setRoleFilter(role)}
                                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${isActive
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                >
                                    {role === 'ALL' ? 'All' : meta?.label}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{count}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* User List */}
                <div ref={listRef} className="space-y-2">
                    {loading && users.length === 0 ? (
                        [...Array(5)].map((_, i) => (
                            <div key={i} className="h-[76px] rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 animate-pulse" />
                        ))
                    ) : filteredUsers.length === 0 ? (
                        <Card className="flex flex-col items-center justify-center py-12">
                            <Users size={40} className="text-gray-300 dark:text-gray-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 font-medium">No users match your filters</p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search or filter criteria</p>
                        </Card>
                    ) : (
                        filteredUsers.map((u) => {
                            const meta = ROLE_META[u.role] || ROLE_META[ROLES.STUDENT];
                            const RoleIcon = meta.icon;
                            const name = u.fullName || u.full_name || u.email || 'Unknown';
                            const initial = name.charAt(0).toUpperCase();

                            return (
                                <div
                                    key={u.id}
                                    className={`group relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${u.isFlagged
                                        ? 'border-red-200 dark:border-red-800/40 bg-red-50/30 dark:bg-red-900/5'
                                        : !u.isActive
                                            ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 opacity-60'
                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    {/* Avatar */}
                                    <div className="relative flex-shrink-0">
                                        {u.avatarUrl ? (
                                            <img src={u.avatarUrl} alt={name} className="w-11 h-11 rounded-xl object-cover shadow-sm" />
                                        ) : (
                                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                                                {initial}
                                            </div>
                                        )}
                                        {/* Online indicator */}
                                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800 ${u.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                    </div>

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-semibold text-gray-900 dark:text-white truncate">{name}</p>
                                            {u.isFlagged && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/30">
                                                    <AlertTriangle size={10} /> Flagged · {u.overdueCount || 0}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                                                <Mail size={11} /> {u.email}
                                            </span>
                                            {u.department && (
                                                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    <Building2 size={11} /> {u.department}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Role Selector */}
                                    <div className="hidden sm:flex items-center flex-shrink-0">
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${meta.bg} w-[120px]`}>
                                            <RoleIcon size={13} className={meta.text} />
                                            <select
                                                value={u.role}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                className={`flex-1 bg-transparent text-xs font-semibold ${meta.text} outline-none cursor-pointer`}
                                            >
                                                <option value={ROLES.STUDENT}>Student</option>
                                                <option value={ROLES.FACULTY}>Faculty</option>
                                                <option value={ROLES.STAFF}>Staff</option>
                                                <option value={ROLES.ADMIN}>Admin</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="hidden md:block flex-shrink-0">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${u.isActive
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                            }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                            {u.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {/* Unflag button */}
                                        {u.isFlagged && (
                                            unflagConfirmId === u.id ? (
                                                <div className="flex items-center gap-1 mr-1">
                                                    <button type="button" onClick={() => handleUnflagUser(u.id)} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors cursor-pointer">
                                                        ✓ Confirm
                                                    </button>
                                                    <button type="button" onClick={() => setUnflagConfirmId(null)} className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 transition-colors cursor-pointer">
                                                        ✗
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setUnflagConfirmId(u.id)}
                                                    className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                                    title="Remove flag"
                                                    aria-label={`Remove flag from ${name}`}
                                                >
                                                    <ShieldCheck size={18} />
                                                </button>
                                            )
                                        )}

                                        {/* Toggle active */}
                                        <button
                                            onClick={() => handleToggleUserStatus(u.id)}
                                            className={`p-2 rounded-lg transition-colors ${u.isActive
                                                ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                                : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                                }`}
                                            title={u.isActive ? 'Deactivate user' : 'Activate user'}
                                            aria-label={u.isActive ? `Deactivate ${name}` : `Activate ${name}`}
                                        >
                                            {u.isActive ? <UserX size={18} /> : <UserCheck size={18} />}
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={() => { setSelectedUser(u); setShowDeleteModal(true); }}
                                            className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            title="Delete user"
                                            aria-label={`Delete ${name}`}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                {filteredUsers.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
                        Showing {filteredUsers.length} of {users.length} users
                    </p>
                )}
            </div>
        </AdminOnly>
    );
};

export default UsersTab;
