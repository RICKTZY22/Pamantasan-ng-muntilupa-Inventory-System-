import React, { useState, useEffect } from 'react';
import { MagnifyingGlass as Search, Users as UsersIcon, DownloadSimple as Download, FileText, Warning as AlertTriangle, Shield, UserGear as UserCog } from '@phosphor-icons/react';
import { Button, Card, Table, Input } from '../components/ui';
import { AdminOnly } from '../components/auth';
import useUsers from '../hooks/useUsers';
import { ROLES, getRoleLabel, getRoleBadgeColor } from '../utils/roles';
import { exportCSV, exportPDF } from '../utils/exportUtils';

const Users = () => {
    const {
        users,
        loading,
        stats,
        fetchUsers,
    } = useUsers();

    const [search, setSearch] = useState('');
    const [filterRole, setFilterRole] = useState('');
    const [filterStatus, setFilterStatus] = useState('');

    useEffect(() => {
        const statusFilter = filterStatus === '' ? undefined : filterStatus === 'active';
        fetchUsers({ search, role: filterRole, status: statusFilter });
    }, [search, filterRole, filterStatus, fetchUsers]);



    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Never';
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <AdminOnly showAccessDenied>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">Manage user accounts and permissions</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                const headers = ['Name', 'Email', 'Student ID', 'Role', 'Department', 'Status', 'Date Joined', 'Last Login'];
                                const rows = users.map(u => [
                                    u.fullName || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
                                    u.email,
                                    u.studentId || u.student_id || '',
                                    getRoleLabel(u.role),
                                    u.department || '',
                                    u.isActive || u.is_active ? 'Active' : 'Inactive',
                                    u.date_joined ? new Date(u.date_joined).toLocaleDateString() : '',
                                    u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never',
                                ]);
                                exportCSV('users', headers, rows);
                            }}
                            className="px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                            <Download size={16} />
                            CSV
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                const headers = ['Name', 'Email', 'Student ID', 'Role', 'Department', 'Status', 'Last Login'];
                                const rows = users.map(u => [
                                    u.fullName || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
                                    u.email,
                                    u.studentId || u.student_id || '',
                                    getRoleLabel(u.role),
                                    u.department || '',
                                    u.isActive || u.is_active ? 'Active' : 'Inactive',
                                    u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never',
                                ]);
                                const summary = {
                                    'Total Users': stats.total,
                                    'Active': stats.active,
                                    'Inactive': stats.inactive,
                                    'Admins': stats.admins,
                                    'Staff': stats.staff,
                                };
                                exportPDF('users_report', 'PLMun User Management Report', headers, rows, { summary });
                            }}
                            className="px-3 py-2 text-sm font-medium bg-primary/10 text-primary rounded-xl hover:bg-primary/20 cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                            <FileText size={16} />
                            PDF
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 dark:bg-primary/10 rounded-bl-full" />
                        <UsersIcon size={18} className="text-primary mb-1.5" />
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                    </Card>
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-bl-full" />
                        <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
                    </Card>
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 dark:bg-red-500/10 rounded-bl-full" />
                        <div className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        </div>
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.inactive}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Inactive</p>
                    </Card>
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/5 dark:bg-green-500/10 rounded-bl-full" />
                        <Shield size={18} className="text-green-600 dark:text-green-400 mb-1.5" />
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.admins}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Admin</p>
                    </Card>
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 dark:bg-blue-500/10 rounded-bl-full" />
                        <UserCog size={18} className="text-blue-600 dark:text-blue-400 mb-1.5" />
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.staff}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Staff</p>
                    </Card>
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-yellow-500/5 dark:bg-yellow-500/10 rounded-bl-full" />
                        <div className="w-4 h-4 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                        </div>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.faculty}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Faculty</p>
                    </Card>
                    <Card className="relative overflow-hidden py-5 px-4">
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 dark:bg-purple-500/10 rounded-bl-full" />
                        <div className="w-4 h-4 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        </div>
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.students}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Students</p>
                    </Card>
                </div>

                {/* Filters */}
                <Card>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                            <Input
                                icon={Search}
                                placeholder="Search users..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <select
                            className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none transition-colors"
                            value={filterRole}
                            onChange={(e) => setFilterRole(e.target.value)}
                        >
                            <option value="">All Roles</option>
                            <option value={ROLES.ADMIN}>Admin</option>
                            <option value={ROLES.STAFF}>Staff</option>
                            <option value={ROLES.FACULTY}>Faculty</option>
                            <option value={ROLES.STUDENT}>Student</option>
                        </select>
                        <select
                            className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none transition-colors"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </Card>

                {/* Table */}
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.Head>User</Table.Head>
                            <Table.Head>Student ID</Table.Head>
                            <Table.Head>Role</Table.Head>
                            <Table.Head>Department</Table.Head>
                            <Table.Head>Status</Table.Head>
                            <Table.Head>Last Login</Table.Head>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {loading ? (
                            <Table.Empty message="Loading..." colSpan={6} />
                        ) : users.length === 0 ? (
                            <Table.Empty message="No users found" colSpan={6} />
                        ) : (
                            users.map((user) => (
                                <Table.Row key={user.id}>
                                    <Table.Cell>
                                        <div className="flex items-center gap-3">
                                            {user.avatarUrl ? (
                                                <img
                                                    src={user.avatarUrl}
                                                    alt={user.fullName || user.username}
                                                    className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-200 dark:ring-gray-700"
                                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling && (e.target.nextElementSibling.style.display = 'flex'); }}
                                                />
                                            ) : null}
                                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary items-center justify-center text-white font-bold ${user.avatarUrl ? 'hidden' : 'flex'}`}>
                                                {(user.fullName || user.username || '?').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-gray-100">{user.fullName}</p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                            </div>
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell>
                                        {user.role === 'STUDENT' && (user.studentId || user.student_id) ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-medium">
                                                {user.studentId || user.student_id}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                        )}
                                    </Table.Cell>
                                    <Table.Cell>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                                            {getRoleLabel(user.role)}
                                        </span>
                                    </Table.Cell>
                                    <Table.Cell className="text-gray-600 dark:text-gray-300">{user.department}</Table.Cell>
                                    <Table.Cell>
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${user.isActive
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                }`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                            {user.isFlagged && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" title={`${user.overdueCount || 0} overdue incident(s)`}>
                                                    <AlertTriangle size={12} />
                                                    Flagged ({user.overdueCount || 0})
                                                </span>
                                            )}
                                        </div>
                                    </Table.Cell>
                                    <Table.Cell className="text-sm text-gray-500">
                                        {formatDate(user.last_login)}
                                    </Table.Cell>
                                </Table.Row>
                            ))
                        )}
                    </Table.Body>
                </Table>


            </div>
        </AdminOnly>
    );
};

export default Users;
