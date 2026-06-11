import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Warning as AlertTriangle, MagnifyingGlass as Search, Clock, Package, CheckCircle,
    FileText, DownloadSimple as Download, Trash as Trash2, Lock, Key as KeyRound,
    SignIn, SignOut, ShieldCheck,
} from '@phosphor-icons/react';
import { Button, Input, Table, Modal } from '../components/ui';
import Avatar from '../components/ui/Avatar';
import { StatChip } from '../components/dashboard';
import { SettingsGroup, SettingCard } from '../components/settings';
import { StaffOnly, AdminOnly } from '../components/auth';
import { requestService, userService, auditService } from '../services';
import { isHistoryOverdue } from '../utils/requestHistory';
import { FINAL_REQUEST_STATUSES } from '../utils/requestLifecycle';
import { getOverdueAge } from '../utils/timeUtils';

const STATUS_COLORS = {
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    RETURN_PENDING: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    RETURNED: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const SELECT = 'px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40';

const TABS = [
    { key: 'activity', label: 'Activity' },
    { key: 'history', label: 'History' },
    { key: 'flags', label: 'Flags' },
];

const ACTION_OPTIONS = [
    { value: '', label: 'All actions' },
    { value: 'Login', label: 'Logged in' },
    { value: 'Logout', label: 'Logged out' },
    { value: 'Request Approved', label: 'Approved' },
    { value: 'Request Rejected', label: 'Rejected' },
];

const actionMeta = (action) => {
    switch (action) {
        case 'Login': return { label: 'Logged in', icon: SignIn, tone: 'text-emerald-600 dark:text-emerald-400' };
        case 'Logout': return { label: 'Logged out', icon: SignOut, tone: 'text-gray-500 dark:text-gray-400' };
        case 'Request Approved': return { label: 'Approved a request', icon: CheckCircle, tone: 'text-blue-600 dark:text-blue-400' };
        case 'Request Rejected': return { label: 'Rejected a request', icon: AlertTriangle, tone: 'text-red-600 dark:text-red-400' };
        default: return { label: action, icon: ShieldCheck, tone: 'text-gray-500 dark:text-gray-400' };
    }
};

const StatusPill = ({ status }) => (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.CANCELLED}`}>{status}</span>
);

const NameCell = ({ name }) => (
    <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold flex-shrink-0">
            {(name || '?').charAt(0).toUpperCase()}
        </span>
        <span className="text-gray-700 dark:text-gray-300">{name || '—'}</span>
    </div>
);

const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTimestamp = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const AuditLogs = () => {
    const [tab, setTab] = useState('activity');

    // Shared request data (History + Flags tabs)
    const [allRequests, setAllRequests] = useState([]);
    const [reqLoading, setReqLoading] = useState(true);

    // Activity (audit) data + filters
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [roleFilter2, setRoleFilter2] = useState('');
    const [dateFilter, setDateFilter] = useState('');   // from
    const [dateTo, setDateTo] = useState('');
    const [itemFilter, setItemFilter] = useState('');
    const [requestFilter, setRequestFilter] = useState('');

    // History filters
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Clear-history modal
    const [clearModalOpen, setClearModalOpen] = useState(false);
    const [clearCode, setClearCode] = useState('');
    const [clearError, setClearError] = useState('');
    const [clearing, setClearing] = useState(false);

    const [unflagging, setUnflagging] = useState(null);

    const fetchRequests = useCallback(async () => {
        setReqLoading(true);
        try {
            const data = await requestService.getAll({ include_cleared: true });
            setAllRequests(Array.isArray(data) ? data : []);
        } catch {
            setAllRequests([]);
        } finally {
            setReqLoading(false);
        }
    }, []);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    // Server-side filters (action/role/date-range/item/request); the user
    // dropdown stays client-side below. Debounced so text inputs don't spam.
    useEffect(() => {
        let active = true;
        setLogsLoading(true);
        const t = setTimeout(() => {
            auditService.getLogs({
                action: actionFilter,
                role: roleFilter2,
                dateFrom: dateFilter,
                dateTo,
                item: itemFilter.trim(),
                request: requestFilter.trim(),
                limit: 200,
            })
                .then((data) => { if (active) setLogs(Array.isArray(data) ? data : []); })
                .catch(() => { if (active) setLogs([]); })
                .finally(() => { if (active) setLogsLoading(false); });
        }, 350);
        return () => { active = false; clearTimeout(t); };
    }, [actionFilter, roleFilter2, dateFilter, dateTo, itemFilter, requestFilter]);

    const userOptions = useMemo(() => {
        const seen = new Map();
        logs.forEach((l) => { if (l.user && !seen.has(l.user)) seen.set(l.user, l.name || l.user); });
        return Array.from(seen, ([value, label]) => ({ value, label }));
    }, [logs]);

    const displayedLogs = useMemo(
        () => (userFilter ? logs.filter((l) => l.user === userFilter) : logs),
        [logs, userFilter],
    );

    const flaggedItems = useMemo(() => {
        const now = new Date();
        return allRequests
            .filter(isHistoryOverdue)
            .map((r) => {
                const { daysOverdue, hoursOverdue } = getOverdueAge(r.expectedReturn, now);
                return { ...r, daysOverdue, hoursOverdue };
            })
            .sort((a, b) => b.hoursOverdue - a.hoursOverdue);
    }, [allRequests]);

    const filteredRequests = useMemo(() => {
        const q = search.toLowerCase();
        return allRequests.filter((r) => {
            const matchSearch = !q
                || (r.itemName || '').toLowerCase().includes(q)
                || (r.requestedBy || '').toLowerCase().includes(q)
                || (r.purpose || '').toLowerCase().includes(q);
            const matchStatus = statusFilter === 'ALL'
                || r.status === statusFilter
                || (statusFilter === 'COMPLETED' && FINAL_REQUEST_STATUSES.includes(r.status));
            return matchSearch && matchStatus;
        });
    }, [allRequests, search, statusFilter]);

    const stats = useMemo(() => ({
        total: allRequests.length,
        completed: allRequests.filter((r) => FINAL_REQUEST_STATUSES.includes(r.status)).length,
        flagged: flaggedItems.length,
        pending: allRequests.filter((r) => r.status === 'PENDING').length,
    }), [allRequests, flaggedItems]);

    const exportHistoryCSV = () => {
        const headers = ['#', 'Item', 'Requested By', 'Qty', 'Priority', 'Status', 'Request Date', 'Expected Return', 'Returned At'];
        const rows = filteredRequests.map((r, i) => [
            String(i + 1), r.itemName || '', r.requestedBy || '', String(r.quantity || 0),
            r.priority || 'NORMAL', r.status || '', formatDate(r.requestDate), formatDate(r.expectedReturn), formatDate(r.returnedAt),
        ]);
        const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PLMun_Request_History_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClearHistory = async () => {
        if (!clearCode.trim()) { setClearError('Please enter the clear code.'); return; }
        setClearing(true);
        setClearError('');
        try {
            await requestService.clearHistory(clearCode);
            setClearModalOpen(false);
            setClearCode('');
            await fetchRequests();
        } catch (err) {
            setClearError(err.response?.data?.error || 'Failed to clear history. Check your code.');
        } finally {
            setClearing(false);
        }
    };

    const handleUnflag = async (userId) => {
        if (!userId) return;
        setUnflagging(userId);
        try {
            await userService.unflagUser(userId);
            await fetchRequests();
        } catch {
            /* leave flagged; next scan re-flags anyway */
        } finally {
            setUnflagging(null);
        }
    };

    return (
        <StaffOnly showAccessDenied>
            <div className="space-y-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">
                        Monitor logins, approvals, request history, and flagged accounts.
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${tab === t.key
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Activity ── */}
                {tab === 'activity' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={SELECT} aria-label="Filter by action">
                                {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} className={SELECT} aria-label="Filter by user">
                                <option value="">All users</option>
                                {userOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <select value={roleFilter2} onChange={(e) => setRoleFilter2(e.target.value)} className={SELECT} aria-label="Filter by role">
                                <option value="">All roles</option>
                                <option value="STUDENT">Student</option>
                                <option value="FACULTY">Faculty</option>
                                <option value="STAFF">Staff</option>
                                <option value="ADMIN">Administrator</option>
                            </select>
                            <input type="text" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} placeholder="Item name…" className={SELECT} aria-label="Filter by item" />
                            <input type="text" value={requestFilter} onChange={(e) => setRequestFilter(e.target.value.replace(/\D/g, ''))} placeholder="Request #" inputMode="numeric" className={`${SELECT} w-28`} aria-label="Filter by request number" />
                            <div className="flex items-center gap-1.5">
                                <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className={SELECT} aria-label="From date" />
                                <span className="text-xs text-gray-400">to</span>
                                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={SELECT} aria-label="To date" />
                            </div>
                            {(actionFilter || userFilter || roleFilter2 || dateFilter || dateTo || itemFilter || requestFilter) && (
                                <Button variant="ghost" size="sm" onClick={() => { setActionFilter(''); setUserFilter(''); setRoleFilter2(''); setDateFilter(''); setDateTo(''); setItemFilter(''); setRequestFilter(''); }}>Clear</Button>
                            )}
                        </div>

                        {logsLoading ? (
                            <div className="py-14 text-center">
                                <span className="inline-block w-7 h-7 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
                                <p className="text-sm text-gray-400 dark:text-gray-500">Loading activity…</p>
                            </div>
                        ) : (
                            <Table>
                                <Table.Header>
                                    <Table.Row>
                                        <Table.Head>User</Table.Head>
                                        <Table.Head>Email</Table.Head>
                                        <Table.Head>Action</Table.Head>
                                        <Table.Head>Timestamp</Table.Head>
                                    </Table.Row>
                                </Table.Header>
                                <Table.Body>
                                    {displayedLogs.length === 0 ? (
                                        <Table.Empty colSpan={4} message="No activity for these filters." />
                                    ) : displayedLogs.map((l) => {
                                        const meta = actionMeta(l.action);
                                        const Icon = meta.icon;
                                        return (
                                            <Table.Row key={l.id}>
                                                <Table.Cell>
                                                    <div className="flex items-center gap-2.5">
                                                        <Avatar src={l.avatar} name={l.name} size={32} />
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{l.name}</p>
                                                            <p className="text-xs text-gray-400 truncate">@{l.user}</p>
                                                        </div>
                                                    </div>
                                                </Table.Cell>
                                                <Table.Cell className="text-sm text-gray-600 dark:text-gray-400">{l.email || '—'}</Table.Cell>
                                                <Table.Cell>
                                                    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${meta.tone}`}>
                                                        <Icon size={15} weight="bold" />{meta.label}
                                                    </span>
                                                </Table.Cell>
                                                <Table.Cell className="text-sm text-gray-500 dark:text-gray-400">{formatTimestamp(l.timestamp)}</Table.Cell>
                                            </Table.Row>
                                        );
                                    })}
                                </Table.Body>
                            </Table>
                        )}
                    </div>
                )}

                {/* ── History ── */}
                {tab === 'history' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatChip icon={FileText} value={stats.total} label="All requests" tone="blue" onClick={() => setStatusFilter('ALL')} />
                            <StatChip icon={CheckCircle} value={stats.completed} label="Completed / returned" tone="emerald" onClick={() => setStatusFilter('COMPLETED')} />
                            <StatChip icon={Clock} value={stats.pending} label="Pending" tone="amber" onClick={() => setStatusFilter('PENDING')} />
                            <StatChip icon={AlertTriangle} value={stats.flagged} label="Overdue items" tone={stats.flagged > 0 ? 'red' : 'gray'} onClick={() => setTab('flags')} />
                        </div>

                        <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-4 sm:p-5 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex-1">
                                    <Input icon={Search} placeholder="Search by item, user, or purpose..." value={search} onChange={(e) => setSearch(e.target.value)} />
                                </div>
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT} aria-label="Filter by status">
                                    <option value="ALL">All status</option>
                                    <option value="PENDING">Pending</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="RETURN_PENDING">Return pending</option>
                                    <option value="RETURNED">Returned</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="CANCELLED">Cancelled</option>
                                </select>
                                <div className="flex gap-2">
                                    <Button variant="secondary" size="sm" icon={Download} onClick={exportHistoryCSV}>Export</Button>
                                    <AdminOnly>
                                        <Button variant="danger" size="sm" icon={Trash2} onClick={() => setClearModalOpen(true)}>Clear</Button>
                                    </AdminOnly>
                                </div>
                            </div>

                            {reqLoading ? (
                                <div className="py-14 text-center">
                                    <span className="inline-block w-7 h-7 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-3" />
                                    <p className="text-sm text-gray-400 dark:text-gray-500">Loading request history…</p>
                                </div>
                            ) : (
                                <Table>
                                    <Table.Header>
                                        <Table.Row>
                                            <Table.Head>Item</Table.Head>
                                            <Table.Head>Requested By</Table.Head>
                                            <Table.Head>Qty</Table.Head>
                                            <Table.Head>Status</Table.Head>
                                            <Table.Head>Request Date</Table.Head>
                                            <Table.Head>Approved By</Table.Head>
                                            <Table.Head>Return</Table.Head>
                                        </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                        {filteredRequests.length === 0 ? (
                                            <Table.Empty colSpan={7} message={search || statusFilter !== 'ALL' ? 'No requests match your filters' : 'No request records yet'} />
                                        ) : filteredRequests.map((r) => (
                                            <Table.Row key={r.id}>
                                                <Table.Cell className="font-medium text-gray-800 dark:text-gray-200">{r.itemName}</Table.Cell>
                                                <Table.Cell><NameCell name={r.requestedBy} /></Table.Cell>
                                                <Table.Cell>{r.quantity}</Table.Cell>
                                                <Table.Cell><StatusPill status={r.status} /></Table.Cell>
                                                <Table.Cell className="text-xs">{formatDate(r.requestDate || r.createdAt)}</Table.Cell>
                                                <Table.Cell className="text-xs">{r.approvedBy || '—'}</Table.Cell>
                                                <Table.Cell className="text-xs">
                                                    {r.returnedAt
                                                        ? <span className="text-teal-600 dark:text-teal-400">{formatDate(r.returnedAt)}</span>
                                                        : r.expectedReturn
                                                            ? <span className={r.isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>{r.isOverdue && '⚠ '}{formatDate(r.expectedReturn)}</span>
                                                            : <span className="text-gray-400">—</span>}
                                                </Table.Cell>
                                            </Table.Row>
                                        ))}
                                    </Table.Body>
                                </Table>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Flags ── */}
                {tab === 'flags' && (
                    <SettingsGroup title="Flagged accounts — overdue items" description="Borrowers with unreturned items past their expected return date">
                        <SettingCard
                            icon={AlertTriangle}
                            title="Overdue items"
                            description={`${flaggedItems.length} item${flaggedItems.length !== 1 ? 's' : ''} past due`}
                            expandable
                            defaultOpen
                        >
                            {flaggedItems.length === 0 ? (
                                <div className="py-8 text-center">
                                    <Package size={32} weight="duotone" className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No overdue items — everything is within its return date.</p>
                                </div>
                            ) : (
                                <Table>
                                    <Table.Header>
                                        <Table.Row>
                                            <Table.Head>Borrower</Table.Head>
                                            <Table.Head>Student ID</Table.Head>
                                            <Table.Head>Item</Table.Head>
                                            <Table.Head>Qty</Table.Head>
                                            <Table.Head>Expected Return</Table.Head>
                                            <Table.Head>Overdue</Table.Head>
                                            <Table.Head>Status</Table.Head>
                                            <AdminOnly><Table.Head className="text-right">Action</Table.Head></AdminOnly>
                                        </Table.Row>
                                    </Table.Header>
                                    <Table.Body>
                                        {flaggedItems.map((r) => (
                                            <Table.Row key={r.id}>
                                                <Table.Cell><NameCell name={r.requestedBy} /></Table.Cell>
                                                <Table.Cell>
                                                    {r.requestedByStudentId
                                                        ? <span className="inline-flex px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono">{r.requestedByStudentId}</span>
                                                        : <span className="text-xs text-gray-400">—</span>}
                                                </Table.Cell>
                                                <Table.Cell className="font-medium text-gray-800 dark:text-gray-200">{r.itemName}</Table.Cell>
                                                <Table.Cell>{r.quantity}</Table.Cell>
                                                <Table.Cell>{formatDate(r.expectedReturn)}</Table.Cell>
                                                <Table.Cell>
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${r.daysOverdue > 7
                                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                                        : r.daysOverdue > 3
                                                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                                        <Clock size={11} />{r.daysOverdue > 0 ? `${r.daysOverdue}d` : `${r.hoursOverdue}h`}
                                                    </span>
                                                </Table.Cell>
                                                <Table.Cell><StatusPill status={r.status} /></Table.Cell>
                                                <AdminOnly>
                                                    <Table.Cell className="text-right">
                                                        <Button
                                                            variant="ghost" size="sm"
                                                            loading={unflagging === r.requestedById}
                                                            onClick={() => handleUnflag(r.requestedById)}
                                                        >
                                                            Unflag
                                                        </Button>
                                                    </Table.Cell>
                                                </AdminOnly>
                                            </Table.Row>
                                        ))}
                                    </Table.Body>
                                </Table>
                            )}
                        </SettingCard>
                    </SettingsGroup>
                )}

                {/* Clear-history modal (History tab) */}
                <Modal isOpen={clearModalOpen} onClose={() => { setClearModalOpen(false); setClearCode(''); setClearError(''); }} title="Clear Request History">
                    <div className="space-y-4">
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                            <p className="text-sm text-red-700 dark:text-red-300 font-medium flex items-center gap-2">
                                <AlertTriangle size={16} />
                                This permanently deletes all completed, returned, rejected, and cancelled requests.
                            </p>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                <KeyRound size={14} /> Admin Clear Code
                            </label>
                            <input
                                type="password"
                                value={clearCode}
                                onChange={(e) => { setClearCode(e.target.value); setClearError(''); }}
                                placeholder="Enter the admin-set clear code"
                                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-accent/40"
                                onKeyDown={(e) => e.key === 'Enter' && handleClearHistory()}
                            />
                            {clearError && <p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-1"><Lock size={12} /> {clearError}</p>}
                            <p className="text-xs text-gray-400 mt-2">Contact your system administrator for the clear code.</p>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <Button variant="ghost" onClick={() => { setClearModalOpen(false); setClearCode(''); setClearError(''); }}>Cancel</Button>
                            <Button variant="danger" onClick={handleClearHistory} loading={clearing} icon={Trash2}>Clear History</Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </StaffOnly>
    );
};

export default AuditLogs;
