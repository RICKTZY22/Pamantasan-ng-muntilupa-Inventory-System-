import React, { useState, useEffect, useMemo } from 'react';
import {
    ClockCounterClockwise as History, Warning as AlertTriangle, MagnifyingGlass as Search,
    Clock, Package, CheckCircle, FileText, DownloadSimple as Download, Trash as Trash2,
    Lock, Key as KeyRound,
} from '@phosphor-icons/react';
import { Button, Input, Table, Modal } from '../../components/ui';
import { StatChip } from '../../components/dashboard';
import { SettingsGroup, SettingCard } from '../../components/settings';
import { StaffOnly } from '../../components/auth';
import { requestService } from '../../services';
import { isHistoryOverdue } from '../../utils/requestHistory';
import { getOverdueAge } from '../../utils/timeUtils';

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

const HistoryTab = () => {
    const [allRequests, setAllRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [clearModalOpen, setClearModalOpen] = useState(false);
    const [clearCode, setClearCode] = useState('');
    const [clearError, setClearError] = useState('');
    const [clearing, setClearing] = useState(false);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const data = await requestService.getAll({ include_cleared: true });
                setAllRequests(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Failed to fetch history:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const flaggedItems = useMemo(() => {
        const now = new Date();
        return allRequests
            .filter(isHistoryOverdue)
            .map(r => {
                const { daysOverdue, hoursOverdue } = getOverdueAge(r.expectedReturn, now);
                return {
                    ...r,
                    daysOverdue,
                    hoursOverdue,
                };
            })
            .sort((a, b) => b.hoursOverdue - a.hoursOverdue);
    }, [allRequests]);

    const filteredRequests = useMemo(() => {
        const q = search.toLowerCase();
        return allRequests.filter(r => {
            const matchSearch = !q
                || (r.itemName || '').toLowerCase().includes(q)
                || (r.requestedBy || '').toLowerCase().includes(q)
                || (r.purpose || '').toLowerCase().includes(q);
            const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [allRequests, search, statusFilter]);

    const stats = useMemo(() => ({
        total: allRequests.length,
        completed: allRequests.filter(r => r.status === 'COMPLETED' || r.status === 'RETURNED').length,
        flagged: flaggedItems.length,
        pending: allRequests.filter(r => r.status === 'PENDING').length,
    }), [allRequests, flaggedItems]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const exportHistoryCSV = () => {
        const headers = ['#', 'Item', 'Requested By', 'Qty', 'Priority', 'Status', 'Request Date', 'Expected Return', 'Returned At'];
        const rows = filteredRequests.map((r, i) => [
            String(i + 1), r.itemName || '', r.requestedBy || '', String(r.quantity || 0),
            r.priority || 'NORMAL', r.status || '', formatDate(r.requestDate), formatDate(r.expectedReturn), formatDate(r.returnedAt),
        ]);
        const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
            const data = await requestService.getAll({ include_cleared: true });
            setAllRequests(Array.isArray(data) ? data : []);
        } catch (err) {
            setClearError(err.response?.data?.error || 'Failed to clear history. Check your code.');
        } finally {
            setClearing(false);
        }
    };

    return (
        <StaffOnly showAccessDenied>
            <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatChip icon={FileText} value={stats.total} label="All requests" tone="blue" onClick={() => setStatusFilter('ALL')} />
                    <StatChip icon={CheckCircle} value={stats.completed} label="Completed / returned" tone="emerald" onClick={() => setStatusFilter('COMPLETED')} />
                    <StatChip icon={Clock} value={stats.pending} label="Pending" tone="amber" onClick={() => setStatusFilter('PENDING')} />
                    <StatChip icon={AlertTriangle} value={stats.flagged} label="Overdue items" tone={stats.flagged > 0 ? 'red' : 'gray'} />
                </div>

                {/* Overdue request list */}
                <SettingsGroup title="Flagged accounts — overdue items" description="Borrowers with unreturned items past their expected return date">
                    <SettingCard
                        icon={AlertTriangle}
                        title="Overdue items"
                        description={`${flaggedItems.length} item${flaggedItems.length !== 1 ? 's' : ''} past due`}
                        expandable
                        defaultOpen={flaggedItems.length > 0}
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
                                        </Table.Row>
                                    ))}
                                </Table.Body>
                            </Table>
                        )}
                    </SettingCard>
                </SettingsGroup>

                {/* Full request history */}
                <SettingsGroup title="Complete request history" description="All requests including cleared and archived records">
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
                                <Button variant="danger" size="sm" icon={Trash2} onClick={() => setClearModalOpen(true)}>Clear</Button>
                            </div>
                        </div>

                        {loading ? (
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
                </SettingsGroup>

                {/* Clear history modal */}
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

export default HistoryTab;
