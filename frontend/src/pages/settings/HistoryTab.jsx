import React, { useState, useEffect, useMemo } from 'react';
import { ClockCounterClockwise as History, Warning as AlertTriangle, MagnifyingGlass as Search, Funnel as Filter, Clock, Package, User, CalendarBlank as Calendar, CaretDown as ChevronDown, CaretUp as ChevronUp, FileText, DownloadSimple as Download, Trash as Trash2, Lock, Key as KeyRound } from '@phosphor-icons/react';
import { Card, Button, Table, Modal } from '../../components/ui';
import { StaffOnly } from '../../components/auth';
import { requestService } from '../../services';

const STATUS_COLORS = {
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    RETURNED: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

const HistoryTab = () => {
    const [allRequests, setAllRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [showFlagged, setShowFlagged] = useState(true);
    const [clearModalOpen, setClearModalOpen] = useState(false);
    const [clearCode, setClearCode] = useState('');
    const [clearError, setClearError] = useState('');
    const [clearing, setClearing] = useState(false);

    // Fetch ALL requests including cleared ones
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

    // Flagged: overdue items that haven't been returned
    const flaggedItems = useMemo(() => {
        const now = new Date();
        return allRequests
            .filter(r => {
                if (!['APPROVED', 'COMPLETED'].includes(r.status)) return false;
                if (!r.expectedReturn) return false;
                const retDate = new Date(r.expectedReturn);
                return retDate < now;
            })
            .map(r => {
                const retDate = new Date(r.expectedReturn);
                const diffMs = now - retDate;
                const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
                const hoursOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
                return { ...r, daysOverdue, hoursOverdue };
            })
            .sort((a, b) => b.hoursOverdue - a.hoursOverdue);
    }, [allRequests]);

    // Filtered history
    const filteredRequests = useMemo(() => {
        return allRequests.filter(r => {
            const matchSearch = !search ||
                (r.itemName || '').toLowerCase().includes(search.toLowerCase()) ||
                (r.requestedBy || '').toLowerCase().includes(search.toLowerCase()) ||
                (r.purpose || '').toLowerCase().includes(search.toLowerCase());
            const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
            return matchSearch && matchStatus;
        });
    }, [allRequests, search, statusFilter]);

    // Stats
    const stats = useMemo(() => ({
        total: allRequests.length,
        completed: allRequests.filter(r => r.status === 'COMPLETED' || r.status === 'RETURNED').length,
        flagged: flaggedItems.length,
        pending: allRequests.filter(r => r.status === 'PENDING').length,
    }), [allRequests, flaggedItems]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Export history as CSV
    const exportHistoryCSV = () => {
        const headers = ['#', 'Item', 'Requested By', 'Qty', 'Priority', 'Status', 'Request Date', 'Expected Return', 'Returned At'];
        const rows = filteredRequests.map((r, i) => [
            String(i + 1),
            r.itemName || '',
            r.requestedBy || '',
            String(r.quantity || 0),
            r.priority || 'NORMAL',
            r.status || '',
            formatDate(r.requestDate),
            formatDate(r.expectedReturn),
            formatDate(r.returnedAt),
        ]);
        const csvContent = [headers, ...rows].map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PLMun_Request_History_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClearHistory = async () => {
        if (!clearCode.trim()) {
            setClearError('Please enter the clear code.');
            return;
        }
        setClearing(true);
        setClearError('');
        try {
            await requestService.clearHistory(clearCode);
            setClearModalOpen(false);
            setClearCode('');
            // Re-fetch history
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

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary/10">
                            <FileText size={18} className="text-primary" />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">All Requests</p>
                        </div>
                    </Card>
                    <Card className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10">
                            <Package size={18} className="text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Completed/Returned</p>
                        </div>
                    </Card>
                    <Card className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-amber-500/10">
                            <Clock size={18} className="text-amber-500" />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Pending</p>
                        </div>
                    </Card>
                    <Card className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-red-500/10">
                            <AlertTriangle size={18} className="text-red-500" />
                        </div>
                        <div>
                            <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.flagged}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Overdue Items</p>
                        </div>
                    </Card>
                </div>

                {/* ─── Flagged / Overdue Section ─── */}
                <Card className="p-0 overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowFlagged(!showFlagged)}
                        className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                                <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-semibold text-gray-800 dark:text-gray-100">
                                    Flagged Accounts — Overdue Items
                                    {flaggedItems.length > 0 && (
                                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                                            {flaggedItems.length}
                                        </span>
                                    )}
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Users with unreturned items past their expected return date
                                </p>
                            </div>
                        </div>
                        {showFlagged ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
                    </button>

                    {showFlagged && (
                        <div className="border-t border-gray-100 dark:border-gray-700">
                            {flaggedItems.length === 0 ? (
                                <div className="py-10 text-center">
                                    <Package size={36} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                                    <p className="text-gray-400 dark:text-gray-500 font-medium">No overdue items</p>
                                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">All borrowed items are within their return dates</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm min-w-[700px]">
                                        <thead className="bg-red-50 dark:bg-red-900/10">
                                            <tr>
                                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Borrower</th>
                                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Student ID</th>
                                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Item Borrowed</th>
                                                <th className="px-5 py-3 text-center text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Qty</th>
                                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Expected Return</th>
                                                <th className="px-5 py-3 text-right text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Days Overdue</th>
                                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-red-50 dark:divide-red-900/10">
                                            {flaggedItems.map((r) => (
                                                <tr key={r.id} className="hover:bg-red-50/50 dark:hover:bg-red-900/5 transition-colors">
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white text-xs font-bold">
                                                                {(r.requestedBy || '?').charAt(0).toUpperCase()}
                                                            </div>
                                                            <span className="font-medium text-gray-800 dark:text-gray-200">{r.requestedBy}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        {r.requestedByStudentId ? (
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-medium">
                                                                {r.requestedByStudentId}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3 text-gray-700 dark:text-gray-300 font-medium">{r.itemName}</td>
                                                    <td className="px-5 py-3 text-center text-gray-600 dark:text-gray-400">{r.quantity}</td>
                                                    <td className="px-5 py-3 text-gray-600 dark:text-gray-400">{formatDate(r.expectedReturn)}</td>
                                                    <td className="px-5 py-3 text-right">
                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                            r.daysOverdue > 7
                                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                                                : r.daysOverdue > 3
                                                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                                        }`}>
                                                            <Clock size={11} />
                                                            {r.daysOverdue > 0 ? `${r.daysOverdue}d` : `${r.hoursOverdue}h`}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
                                                            {r.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </Card>

                {/* ─── Full History Section ─── */}
                <Card className="p-0 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <History size={18} className="text-primary" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Complete Request History</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        All requests including cleared and archived records ({filteredRequests.length} total)
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={exportHistoryCSV}
                                className="px-3 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer flex items-center gap-1.5 transition-colors"
                            >
                                <Download size={16} />
                                Export CSV
                            </button>
                            <button
                                type="button"
                                onClick={() => setClearModalOpen(true)}
                                className="px-3 py-2 text-sm font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 cursor-pointer flex items-center gap-1.5 transition-colors"
                            >
                                <Trash2 size={16} />
                                Clear History
                            </button>
                        </div>

                        {/* Filters */}
                        <div className="flex flex-col sm:flex-row gap-3 mt-4">
                            <div className="relative flex-1">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by item, user, or purpose..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none transition-colors"
                                />
                            </div>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none transition-colors"
                            >
                                <option value="ALL">All Status</option>
                                <option value="PENDING">Pending</option>
                                <option value="APPROVED">Approved</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="RETURNED">Returned</option>
                                <option value="REJECTED">Rejected</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>
                        </div>
                    </div>

                    {/* History Table */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <div className="py-16 text-center">
                                <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
                                <p className="text-gray-400 dark:text-gray-500">Loading request history...</p>
                            </div>
                        ) : filteredRequests.length === 0 ? (
                            <div className="py-16 text-center">
                                <History size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                                <p className="text-gray-400 dark:text-gray-500 font-medium">No requests found</p>
                                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                    {search || statusFilter !== 'ALL' ? 'Try adjusting your filters' : 'No request records exist yet'}
                                </p>
                            </div>
                        ) : (
                            <table className="w-full text-sm min-w-[800px]">
                                <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Item</th>
                                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Requested By</th>
                                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Qty</th>
                                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Request Date</th>
                                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Approved By</th>
                                        <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Return</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                    {filteredRequests.map((r) => {
                                        const isOverdue = r.isOverdue;
                                        return (
                                            <tr key={r.id} className={`transition-colors ${isOverdue ? 'bg-red-50/30 dark:bg-red-900/5' : 'hover:bg-gray-50 dark:hover:bg-gray-700/20'}`}>
                                                <td className="px-4 py-3">
                                                    <span className="font-medium text-gray-800 dark:text-gray-200">{r.itemName}</span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white text-[10px] font-bold">
                                                            {(r.requestedBy || '?').charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-gray-700 dark:text-gray-300">{r.requestedBy}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{r.quantity}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
                                                        {r.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{formatDate(r.requestDate || r.createdAt)}</td>
                                                <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{r.approvedBy || '—'}</td>
                                                <td className="px-4 py-3 text-xs">
                                                    {r.returnedAt ? (
                                                        <span className="text-teal-600 dark:text-teal-400">{formatDate(r.returnedAt)}</span>
                                                    ) : r.expectedReturn ? (
                                                        <span className={isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                                                            {isOverdue && '⚠ '}{formatDate(r.expectedReturn)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Card>

                {/* Clear History Modal */}
                <Modal isOpen={clearModalOpen} onClose={() => { setClearModalOpen(false); setClearCode(''); setClearError(''); }} title="Clear Request History">
                    <div className="space-y-4">
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                            <p className="text-sm text-red-700 dark:text-red-300 font-medium flex items-center gap-2">
                                <AlertTriangle size={16} />
                                This will permanently delete all completed, returned, rejected, and cancelled requests.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                <KeyRound size={14} />
                                Admin Clear Code
                            </label>
                            <input
                                type="password"
                                value={clearCode}
                                onChange={(e) => { setClearCode(e.target.value); setClearError(''); }}
                                placeholder="Enter the admin-set clear code"
                                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary"
                                onKeyDown={(e) => e.key === 'Enter' && handleClearHistory()}
                            />
                            {clearError && (
                                <p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                                    <Lock size={12} /> {clearError}
                                </p>
                            )}
                            <p className="text-xs text-gray-400 mt-2">Contact your system administrator for the clear code. Default: PLMun2025</p>
                        </div>
                        <div className="flex gap-3 justify-end pt-2">
                            <Button variant="ghost" onClick={() => { setClearModalOpen(false); setClearCode(''); setClearError(''); }}>Cancel</Button>
                            <Button
                                className="bg-red-600 hover:bg-red-700 text-white"
                                onClick={handleClearHistory}
                                loading={clearing}
                                icon={Trash2}
                            >
                                Clear History
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </StaffOnly>
    );
};

export default HistoryTab;
