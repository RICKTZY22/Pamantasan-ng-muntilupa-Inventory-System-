import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, MagnifyingGlass as Search, Check, X, Clock, CheckCircle, Package, Lock, Eye, FileText, User, CalendarBlank as Calendar, ArrowCounterClockwise as RotateCcw, Trash as Trash2, Warning as AlertTriangle, Timer, Prohibit as Ban, CaretDown as ChevronDown, CaretRight as ChevronRight, Flag } from '@phosphor-icons/react';
import { Button, Input, Modal, Table } from '../components/ui';
import { StaffOnly } from '../components/auth';
import { useRequests, useInventory, useIsMobile } from '../hooks';
import useAuthStore from '../store/authStore';
import { hasMinRole, ROLES } from '../utils/roles';
import { buildRequestTabParams, canCompleteRequest, canStartReturn as canStartRequestReturn } from '../utils/requestLifecycle';
import { getCreditTone, normalizeRequestBorrower } from '../utils/requestBorrower';
import { useLocation } from 'react-router-dom';

const statusColors = {
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    RETURN_PENDING: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    RETURNED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    CANCELLED: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const priorityConfig = {
    HIGH: { label: 'High', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: '🔴', weight: 3 },
    MEDIUM: { label: 'Medium', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: '🟡', weight: 2 },
    LOW: { label: 'Low', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', icon: '⚪', weight: 1 },
};

// Status tabs for the paged Requests list. 'OVERDUE' is a pseudo-status (server
// filters by outstanding + past-due); the rest map straight to Request.status.
const STATUS_TABS = [
    { key: 'ALL', label: 'All' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'OVERDUE', label: 'Overdue' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'RETURN_PENDING', label: 'Return Pending' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'REJECTED', label: 'Rejected' },
    { key: 'CANCELLED', label: 'Cancelled' },
];

const PriorityBadge = ({ priority }) => {
    const cfg = priorityConfig[priority] || priorityConfig.MEDIUM;
    return (
        <span className={`inline-flex min-w-[68px] items-center justify-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${cfg.color}`}>
            <Flag size={10} />
            {cfg.label}
        </span>
    );
};

const StatusBadge = ({ status, overdue }) => (
    <span className={`inline-flex min-w-[96px] items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${overdue ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : statusColors[status] || statusColors.CANCELLED}`}>
        {overdue ? 'OVERDUE' : status?.replace('_', ' ') || 'UNKNOWN'}
    </span>
);

const AutoBadge = () => (
    <span className="inline-flex h-5 items-center rounded-full bg-indigo-50 px-2 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:ring-indigo-800/50">
        AUTO
    </span>
);

// Row of action buttons shared by mobile and desktop request views.
// Compact mode (mobile) uses smaller icons and adds text labels next to the
// primary actions; desktop renders icon-only with bigger hit targets.
const RequestActionButtons = ({ request, isOwn, isStaffPlus, compact, onView, onApprove, onReject, onCancel, onComplete, onReturn, onConfirmReturn, onCancelReturn }) => {
    const iconSize = compact ? 15 : 16;
    const isPending = request.status === 'PENDING';
    // Borrower OR staff can START a return (step 1). Only staff CONFIRM it (step 2).
    const canStartReturn = canStartRequestReturn(request, isOwn, isStaffPlus);
    const canComplete = canCompleteRequest(request, isStaffPlus);
    const isReturnPending = request.status === 'RETURN_PENDING';
    const baseClass = compact
        ? 'inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30'
        : 'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30';

    return (
        <div className={compact ? 'flex flex-wrap gap-1 pt-1' : 'flex justify-end gap-1'}>
            <button type="button" onClick={onView} className={`${baseClass} text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20`} title="View Details" aria-label="View request details">
                <Eye size={iconSize} />{compact && <span className="text-xs ml-1">View</span>}
            </button>
            {isPending && isOwn && (
                <button type="button" onClick={onCancel} className={`${baseClass} text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700`} title="Cancel Request" aria-label="Cancel request">
                    <Ban size={iconSize} />
                </button>
            )}
            {isPending && !isOwn && isStaffPlus && (
                <>
                    <button type="button" onClick={onApprove} className={`${baseClass} text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20`} title="Approve" aria-label="Approve request">
                        <Check size={iconSize} />{compact && <span className="text-xs ml-1">Approve</span>}
                    </button>
                    <button type="button" onClick={onReject} className={`${baseClass} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`} title="Reject" aria-label="Reject request">
                        <X size={iconSize} />
                    </button>
                </>
            )}
            {canStartReturn && (
                <button type="button" onClick={onReturn} className={`${baseClass} text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20`} title="Return item" aria-label="Return item">
                    <RotateCcw size={iconSize} />{compact && <span className="text-xs ml-1">Return</span>}
                </button>
            )}
            {canComplete && (
                <button type="button" onClick={onComplete} className={`${baseClass} text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20`} title="Mark completed" aria-label="Mark completed">
                    <CheckCircle size={iconSize} />{compact && <span className="text-xs ml-1">Complete</span>}
                </button>
            )}
            {isReturnPending && isStaffPlus && (
                <button type="button" onClick={onConfirmReturn} className={`${baseClass} text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20`} title="Confirm the item was physically received" aria-label="Confirm returned item">
                    <Check size={iconSize} />{compact ? <span className="text-xs ml-1">Confirm received</span> : <span className="text-xs ml-1 hidden lg:inline">Confirm</span>}
                </button>
            )}
            {isReturnPending && isOwn && !isStaffPlus && (
                <span className="self-center px-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">Awaiting staff confirmation</span>
            )}
            {isReturnPending && (isOwn || isStaffPlus) && (
                <button type="button" onClick={onCancelReturn} className={`${baseClass} text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700`} title="Cancel this pending return" aria-label="Cancel pending return">
                    <Ban size={iconSize} />{compact && <span className="text-xs ml-1">Cancel</span>}
                </button>
            )}
        </div>
    );
};

const RequestMobileCard = ({ request, isOwn, onSelect, ...actions }) => {
    const borrower = normalizeRequestBorrower(request);
    return (
    <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onSelect} className="min-w-0 text-left">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{borrower.fullName}</p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">{borrower.studentId || request.requestDate}</p>
            </button>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {request.autoDecided && <AutoBadge />}
                <PriorityBadge priority={request.priority} />
                <span className="text-xs text-gray-400">x{request.quantity}</span>
            </div>
        </div>
        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/70">
            <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{request.itemName}</p>
                <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-gray-400">x{request.quantity}</span>
            </div>
            {request.purpose && <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{request.purpose}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <StatusBadge status={request.status} overdue={request.isOverdue} />
            <span className="flex items-center gap-1"><Calendar size={12} />{request.requestDate}</span>
            {request.expectedReturn && <span className="flex items-center gap-1"><Clock size={12} />{new Date(request.expectedReturn).toLocaleDateString()}</span>}
        </div>
        <RequestActionButtons request={request} isOwn={isOwn} compact {...actions} />
    </div>
    );
};

const RequestDesktopRow = ({ request, isOwn, selected, onSelect, ...actions }) => {
    const borrower = normalizeRequestBorrower(request);
    return (
        <Table.Row
            clickable
            onClick={onSelect}
            className={selected ? 'bg-indigo-50/70 dark:bg-indigo-900/20' : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/50'}
        >
            <Table.Cell className="w-[240px]">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-xs font-bold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600">
                        {borrower.avatarUrl ? (
                            <img src={borrower.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                        ) : borrower.fullName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{borrower.fullName}</p>
                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{borrower.studentId || borrower.email || borrower.username || 'No ID'}</p>
                    </div>
                </div>
            </Table.Cell>
            <Table.Cell className="w-[280px]">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{request.itemName}</p>
                        {request.autoDecided && <AutoBadge />}
                    </div>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{request.purpose || 'No purpose specified'}</p>
                </div>
            </Table.Cell>
            <Table.Cell className="w-[64px] text-center font-semibold">{request.quantity}</Table.Cell>
            <Table.Cell className="w-[116px]"><StatusBadge status={request.status} overdue={request.isOverdue} /></Table.Cell>
            <Table.Cell className="w-[96px]"><PriorityBadge priority={request.priority} /></Table.Cell>
            <Table.Cell className="w-[150px] text-xs">
                <span className="block text-gray-700 dark:text-gray-300">{request.expectedReturn ? new Date(request.expectedReturn).toLocaleDateString() : request.requestDate}</span>
                <span className="block text-[11px] text-gray-400">{request.expectedReturn ? 'Due date' : 'Requested'}</span>
            </Table.Cell>
            <Table.Cell className="w-[160px]" onClick={(event) => event.stopPropagation()}>
                <RequestActionButtons request={request} isOwn={isOwn} compact={false} {...actions} />
            </Table.Cell>
        </Table.Row>
    );
};

// Responsive layout: cards on mobile, table on desktop. This thin router
// hands each request off to the appropriate row component and forwards the
// callbacks each row needs.
const RequestGroupBody = ({ groupRequests, user, isStaffPlus, selectedRequestId, onSelectRequest, handleApprove, handleRejectClick, handleCancelClick, completeRequest, returnRequest, confirmReturn, cancelReturn, setDetailRequest, setDetailModalOpen }) => {
    const isMobile = useIsMobile();

    const rowProps = (request) => ({
        request,
        isOwn: request.requestedById === user?.id,
        isStaffPlus,
        onView: () => {
            setDetailRequest(request);
            setDetailModalOpen(true);
        },
        onSelect: () => onSelectRequest(request),
        onApprove: () => handleApprove(request.id),
        onReject: () => handleRejectClick(request.id),
        onCancel: () => handleCancelClick(request.id),
        onComplete: () => completeRequest(request.id),
        onReturn: () => returnRequest(request.id),
        onConfirmReturn: () => confirmReturn(request.id),
        onCancelReturn: () => cancelReturn(request.id),
    });

    if (isMobile) {
        return (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {groupRequests.map(req => <RequestMobileCard key={req.id} {...rowProps(req)} />)}
            </div>
        );
    }

    return (
        <Table>
            <Table.Header>
                <Table.Row>
                    <Table.Head className="w-[240px]">Borrower</Table.Head>
                    <Table.Head className="w-[280px]">Request</Table.Head>
                    <Table.Head className="w-[64px] text-center">Qty</Table.Head>
                    <Table.Head className="w-[116px]">Status</Table.Head>
                    <Table.Head>Priority</Table.Head>
                    <Table.Head className="w-[150px]">Date</Table.Head>
                    <Table.Head className="w-[160px] text-right">Actions</Table.Head>
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {groupRequests.map(req => (
                    <RequestDesktopRow
                        key={req.id}
                        selected={selectedRequestId === req.id}
                        {...rowProps(req)}
                    />
                ))}
            </Table.Body>
        </Table>
    );
};

const RequestStatsStrip = ({ stats }) => {
    const items = [
        { label: 'Total', value: stats.total, tone: 'text-gray-900 dark:text-gray-100' },
        { label: 'Pending', value: stats.pending, tone: 'text-amber-600 dark:text-amber-300' },
        { label: 'Approved', value: stats.approved, tone: 'text-emerald-600 dark:text-emerald-300' },
        { label: 'Completed', value: stats.completed, tone: 'text-blue-600 dark:text-blue-300' },
        { label: 'Rejected', value: stats.rejected, tone: 'text-red-600 dark:text-red-300' },
        { label: 'Overdue', value: stats.overdue, tone: 'text-orange-600 dark:text-orange-300' },
    ];
    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {items.map((item) => (
                <div key={item.label} className="rounded-lg border border-gray-200 bg-white/70 px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-700/70 dark:bg-gray-900/40">
                    <p className={`text-lg font-bold leading-none ${item.tone}`}>{item.value ?? 0}</p>
                    <p className="mt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">{item.label}</p>
                </div>
            ))}
        </div>
    );
};

const RequestEmptyState = ({ search, activeTab, activeTabLabel }) => (
    <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
            <Package size={24} />
        </div>
        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">
            {search.trim()
                ? 'No requests match your search.'
                : activeTab === 'ALL'
                    ? 'No requests found.'
                    : `No ${activeTabLabel.toLowerCase()} requests.`}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Try another tab or borrower search.</p>
    </div>
);

const BorrowerSidePanel = ({ request, isOwn, isStaffPlus, actions }) => {
    if (!isStaffPlus) return null;
    const borrower = request ? normalizeRequestBorrower(request) : null;
    const creditTone = getCreditTone(borrower?.creditScore);
    const creditClass = {
        good: 'text-emerald-600 dark:text-emerald-300',
        warning: 'text-amber-600 dark:text-amber-300',
        danger: 'text-red-600 dark:text-red-300',
        neutral: 'text-gray-500 dark:text-gray-400',
    }[creditTone];

    return (
        <aside className="hidden w-[320px] shrink-0 xl:block">
            <div className="sticky top-20 rounded-xl border border-gray-200 bg-white/85 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-gray-700/70 dark:bg-gray-900/75">
                {!borrower ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                        <User size={28} className="text-gray-300 dark:text-gray-600" />
                        <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">Select a request</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Borrower details will appear here.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-sm font-bold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:ring-gray-600">
                                    {borrower.avatarUrl ? (
                                        <img src={borrower.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                                    ) : borrower.fullName.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{borrower.fullName}</p>
                                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{borrower.studentId || borrower.email || borrower.username}</p>
                                </div>
                            </div>
                            {borrower.isFlagged && (
                                <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300">FLAGGED</span>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800/70">
                                <p className={`text-lg font-bold leading-none ${creditClass}`}>{borrower.creditScore ?? '--'}</p>
                                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Credit</p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800/70">
                                <p className="text-lg font-bold leading-none text-red-600 dark:text-red-300">{borrower.overdueCount ?? 0}</p>
                                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Late</p>
                            </div>
                            <div className="rounded-lg bg-gray-50 p-2 text-center dark:bg-gray-800/70">
                                <p className="text-lg font-bold leading-none text-emerald-600 dark:text-emerald-300">{borrower.earlyReturnCount ?? 0}</p>
                                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">Early</p>
                            </div>
                        </div>

                        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-700/70 dark:bg-gray-800/50">
                            <p className="text-[11px] font-semibold uppercase text-gray-400 dark:text-gray-500">Borrower</p>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <span className="text-gray-500 dark:text-gray-400">Role</span>
                                <span className="truncate text-right font-medium text-gray-800 dark:text-gray-100">{borrower.role || 'Unknown'}</span>
                                <span className="text-gray-500 dark:text-gray-400">Department</span>
                                <span className="truncate text-right font-medium text-gray-800 dark:text-gray-100">{borrower.department || 'None'}</span>
                                <span className="text-gray-500 dark:text-gray-400">Account</span>
                                <span className={`text-right font-medium ${borrower.isActive ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{borrower.isActive ? 'Active' : 'Disabled'}</span>
                            </div>
                        </div>

                        {request && (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-semibold uppercase text-gray-400 dark:text-gray-500">Selected request</p>
                                    <StatusBadge status={request.status} overdue={request.isOverdue} />
                                </div>
                                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/70">
                                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{request.itemName}</p>
                                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{request.purpose || 'No purpose specified'}</p>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <span className="text-gray-500 dark:text-gray-400">Quantity</span>
                                        <span className="text-right font-medium text-gray-800 dark:text-gray-100">{request.quantity}</span>
                                        <span className="text-gray-500 dark:text-gray-400">Requested</span>
                                        <span className="text-right font-medium text-gray-800 dark:text-gray-100">{request.requestDate}</span>
                                        <span className="text-gray-500 dark:text-gray-400">Due</span>
                                        <span className="text-right font-medium text-gray-800 dark:text-gray-100">{request.expectedReturn ? new Date(request.expectedReturn).toLocaleDateString() : 'Not set'}</span>
                                    </div>
                                </div>
                                <RequestActionButtons request={request} isOwn={isOwn} isStaffPlus compact {...actions} />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
};

const Requests = () => {
    const {
        requests,
        loading,
        stats,
        totalCount,
        fetchPage,
        fetchStats,
        approveRequest,
        rejectRequest,
        cancelRequest,
        completeRequest,
        returnRequest,
        confirmReturn,
        cancelReturn,
        clearCompleted,
        createRequest,
        checkOverdue
    } = useRequests();
    const PAGE_SIZE = 50;  // matches the backend REST_FRAMEWORK PAGE_SIZE
    const { getAccessibleItems, fetchInventory } = useInventory();
    const { user } = useAuthStore();
    const location = useLocation();

    const isStaffPlus = hasMinRole(user?.role, ROLES.STAFF);
    const [viewMode, setViewMode] = useState(isStaffPlus ? 'all' : 'mine');

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [activeTab, setActiveTab] = useState(isStaffPlus ? 'ALL' : 'PENDING');  // status tab; 'OVERDUE' is a pseudo-status
    const staffDefaultTabApplied = useRef(isStaffPlus);
    const [page, setPage] = useState(1);
    const [reloadKey, setReloadKey] = useState(0);          // bump to force a refetch (after actions)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectRequestId, setRejectRequestId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');

    // cancel modal states
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelRequestId, setCancelRequestId] = useState(null);

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [detailRequest, setDetailRequest] = useState(null);
    const [selectedRequestId, setSelectedRequestId] = useState(null);

    const [itemSearch, setItemSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);

    const savedPrefsKey = user?.id ? `user-prefs-${user.id}` : null;
    const savedPrefs = useMemo(() => {
        if (!savedPrefsKey) return {};
        try {
            const raw = localStorage.getItem(savedPrefsKey);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }, [savedPrefsKey]);

    const [formData, setFormData] = useState({
        itemName: '',
        item: null,
        quantity: savedPrefs.defaultQuantity || 1,
        purpose: savedPrefs.defaultPurpose || '',
    });
    const [formError, setFormError] = useState('');

    // Debounce the search box so typing doesn't fire a request per keystroke;
    // reset to the first page whenever the query changes.
    useEffect(() => {
        const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        if (isStaffPlus && !staffDefaultTabApplied.current) {
            setActiveTab('ALL');
            staffDefaultTabApplied.current = true;
        } else if (!isStaffPlus && activeTab === 'ALL') {
            setActiveTab('PENDING');
        }
    }, [activeTab, isStaffPlus]);

    // Server-side filter for the active status tab ('OVERDUE' is a pseudo-status).
    const tabParams = useMemo(() => {
        return buildRequestTabParams({
            activeTab,
            viewMode,
            search: debouncedSearch,
        });
    }, [activeTab, viewMode, debouncedSearch]);

    // Fetch ONE 50-row page for the active tab whenever the filter/page changes
    // (or reloadKey is bumped after an action). No more loading the whole table.
    useEffect(() => {
        fetchPage({ ...tabParams, page });
    }, [tabParams, page, reloadKey, fetchPage]);

    // Summary cards use the aggregate stats endpoint (refreshed after actions).
    useEffect(() => {
        fetchStats();
    }, [fetchStats, reloadKey]);

    // After an action: go back to page 1 and refetch. Staying on page 1 means we
    // can never sit on a now-empty out-of-range page (no DRF 404).
    const reload = useCallback(() => {
        setPage(1);
        setReloadKey(k => k + 1);
    }, []);

    useEffect(() => {
        checkOverdue();
    }, [checkOverdue]);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory]);

    useEffect(() => {
        const prefill = location.state?.prefillItem;
        if (prefill) {
            setSelectedItem(prefill);
            setItemSearch(prefill.name);
            setFormData(prev => ({ ...prev, itemName: prefill.name, item: prefill.id }));
            setIsModalOpen(true);
            // Clear state so it doesn't re-trigger on navigation
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const filteredItems = useMemo(() => {
        if (!user?.role) return [];
        return getAccessibleItems(user.role, itemSearch);
    }, [user?.role, itemSearch, getAccessibleItems]);

    // The list now shows one server page at a time; totalPages drives the controls.
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const visibleStatusTabs = useMemo(
        () => (isStaffPlus ? STATUS_TABS : STATUS_TABS.filter(tab => tab.key !== 'ALL')),
        [isStaffPlus],
    );
    const activeTabLabel = visibleStatusTabs.find(t => t.key === activeTab)?.label || '';
    const searchPlaceholder = isStaffPlus
        ? 'Search borrower name, student ID, email...'
        : 'Search your requests...';
    const selectedRequest = useMemo(
        () => requests.find(req => req.id === selectedRequestId) || requests[0] || null,
        [requests, selectedRequestId],
    );

    useEffect(() => {
        if (!requests.length) {
            setSelectedRequestId(null);
            return;
        }
        if (!selectedRequestId || !requests.some(req => req.id === selectedRequestId)) {
            setSelectedRequestId(requests[0].id);
        }
    }, [requests, selectedRequestId]);

    const handleSelectRequest = useCallback((request) => {
        setSelectedRequestId(request.id);
    }, []);

    const handleApprove = async (id) => {
        const res = await approveRequest(id);
        if (res?.success) reload();
    };

    const handleComplete = async (id) => {
        const res = await completeRequest(id);
        if (res?.success) reload();
    };

    // Return-handshake actions, wrapped so the page refreshes after each.
    const handleReturn = async (id) => { const res = await returnRequest(id); if (res?.success) reload(); };
    const handleConfirmReturn = async (id) => { const res = await confirmReturn(id); if (res?.success) reload(); };
    const handleCancelReturn = async (id) => { const res = await cancelReturn(id); if (res?.success) reload(); };

    const handleRejectClick = (id) => {
        setRejectRequestId(id);
        setRejectModalOpen(true);
    };

    const handleRejectConfirm = async () => {
        const res = await rejectRequest(rejectRequestId, rejectReason);
        setRejectModalOpen(false);
        setRejectReason('');
        setRejectRequestId(null);
        if (res?.success) reload();
    };

    const handleSelectItem = (inventoryItem) => {
        setSelectedItem(inventoryItem);
        setItemSearch(inventoryItem.name);
        setFormData({ ...formData, itemName: inventoryItem.name, item: inventoryItem.id });
        setShowDropdown(false);
        setFormError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedItem) {
            setFormError('Please select an item from the list');
            return;
        }
        setFormError('');
        const payload = {
            item: formData.item,
            itemName: formData.itemName,
            quantity: formData.quantity,
            purpose: formData.purpose,
        };
        const res = await createRequest(payload);
        if (res?.success) {
            setIsModalOpen(false);
            setFormData({ itemName: '', item: null, quantity: savedPrefs.defaultQuantity || 1, purpose: savedPrefs.defaultPurpose || '' });
            setItemSearch('');
            setSelectedItem(null);
            reload();
            fetchInventory();
        } else {
            // Re-check at submit: the backend re-validates against the item's LIVE
            // status/stock. If it was rejected (e.g. the item went out of stock or
            // in use while the form was open), show a clean message and refresh
            // inventory so the now-unavailable item drops out of the picker.
            const raw = res?.error || 'Failed to submit request';
            setFormError(raw.replace(/^(item|quantity|detail|non_field_errors):\s*/i, ''));
            fetchInventory();
            // Only drop the selection when the item itself is no longer requestable;
            // for a quantity error keep it so the user can just lower the amount.
            if (/available items can be requested|not allowed to request/i.test(raw)) {
                setSelectedItem(null);
                setItemSearch('');
                setFormData(prev => ({ ...prev, item: null, itemName: '' }));
            }
        }
    };

    const handleCancelClick = (id) => {
        setCancelRequestId(id);
        setCancelModalOpen(true);
    };

    const handleCancelConfirm = async () => {
        let res;
        if (cancelRequestId) {
            res = await cancelRequest(cancelRequestId);
        }
        setCancelModalOpen(false);
        setCancelRequestId(null);
        if (res?.success) reload();
    };

    const selectedPanelActions = selectedRequest ? {
        onView: () => {
            setDetailRequest(selectedRequest);
            setDetailModalOpen(true);
        },
        onApprove: () => handleApprove(selectedRequest.id),
        onReject: () => handleRejectClick(selectedRequest.id),
        onCancel: () => handleCancelClick(selectedRequest.id),
        onComplete: () => handleComplete(selectedRequest.id),
        onReturn: () => handleReturn(selectedRequest.id),
        onConfirmReturn: () => handleConfirmReturn(selectedRequest.id),
        onCancelReturn: () => handleCancelReturn(selectedRequest.id),
    } : {};

    return (
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Requests</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">Manage borrowing and reservation requests</p>
                </div>
                <div className="flex gap-2">
                    <StaffOnly>
                        <Button variant="outline" icon={Trash2} onClick={async () => { const res = await clearCompleted(); if (res?.success) reload(); }} className="text-gray-600">
                            <span className="hidden md:inline">Clear Completed</span>
                        </Button>
                    </StaffOnly>
                    <Button icon={Plus} onClick={() => setIsModalOpen(true)}>
                        <span className="hidden sm:inline">New </span>Request
                    </Button>
                </div>
            </div>

            {/* View mode tabs */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-fit">
                <button
                    onClick={() => { setViewMode('mine'); setPage(1); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${viewMode === 'mine'
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                >
                    My Requests
                    {viewMode === 'mine' && <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{stats.total}</span>}
                </button>
                {isStaffPlus && (
                    <button
                        onClick={() => { setViewMode('all'); setPage(1); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${viewMode === 'all'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                    >
                        All Requests
                        {viewMode === 'all' && <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{stats.total}</span>}
                    </button>
                )}
            </div>

            <RequestStatsStrip stats={stats} />

            <div className="rounded-xl border border-gray-200 bg-white/80 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-700/70 dark:bg-gray-900/50">
                <Input
                    icon={Search}
                    placeholder={searchPlaceholder}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Status tabs — each loads a server-paginated page of that status */}
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white/70 p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-gray-700/70 dark:bg-gray-900/50">
                {visibleStatusTabs.map(tab => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => { setActiveTab(tab.key); setPage(1); }}
                        className={`h-8 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors ${activeTab === tab.key
                            ? 'bg-accent text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-gray-200 bg-white/80 py-16 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-gray-700/70 dark:bg-gray-900/60">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                    <span className="ml-3 text-gray-500">Loading requests...</span>
                </div>
            ) : requests.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-gray-700/70 dark:bg-gray-900/60">
                    <RequestEmptyState search={search} activeTab={activeTab} activeTabLabel={activeTabLabel} />
                </div>
            ) : (
                <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1 space-y-3 rounded-xl border border-gray-200 bg-white/85 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.06)] dark:border-gray-700/70 dark:bg-gray-900/60">
                        <div className="overflow-hidden rounded-lg">
                        <RequestGroupBody
                            groupRequests={requests}
                            user={user}
                            isStaffPlus={isStaffPlus}
                            selectedRequestId={selectedRequestId}
                            onSelectRequest={handleSelectRequest}
                            handleApprove={handleApprove}
                            handleRejectClick={handleRejectClick}
                            handleCancelClick={handleCancelClick}
                            completeRequest={handleComplete}
                            returnRequest={handleReturn}
                            confirmReturn={handleConfirmReturn}
                            cancelReturn={handleCancelReturn}
                            setDetailRequest={setDetailRequest}
                            setDetailModalOpen={setDetailModalOpen}
                        />
                        </div>

                    {/* Pagination — server-side, one 50-row page at a time */}
                    <div className="flex items-center justify-between gap-3 px-2 pb-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{(page - 1) * PAGE_SIZE + 1}</span>
                            –<span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min(page * PAGE_SIZE, totalCount)}</span>
                            {' '}of <span className="font-semibold text-gray-700 dark:text-gray-200">{totalCount}</span>
                        </p>
                        <div className="flex h-9 items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="h-8 min-w-[64px] rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Prev
                            </button>
                            <span className="min-w-[56px] text-center text-sm text-gray-500 dark:text-gray-400">{page} / {totalPages}</span>
                            <button
                                type="button"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="h-8 min-w-[64px] rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                    </div>
                    <BorrowerSidePanel
                        request={selectedRequest}
                        isOwn={Boolean(selectedRequest && selectedRequest.requestedById === user?.id)}
                        isStaffPlus={isStaffPlus}
                        actions={selectedPanelActions}
                    />
                </div>
            )}

            {/* New request modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title="New Request"
                description="Create a new borrowing or reservation request"
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1 relative">
                        <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Select Item *</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={itemSearch}
                                onChange={(e) => {
                                    setItemSearch(e.target.value);
                                    setShowDropdown(true);
                                    if (!e.target.value) {
                                        setSelectedItem(null);
                                        setFormData({ ...formData, itemName: '', item: null });
                                    }
                                }}
                                onFocus={() => setShowDropdown(true)}
                                placeholder="Type to search available items..."
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                            />
                            <Package size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        </div>
                        {formError && (
                            <p className="text-xs text-red-500 mt-1 ml-1">{formError}</p>
                        )}

                        {showDropdown && itemSearch && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                                {filteredItems.length === 0 ? (
                                    <div className="p-4 text-center text-gray-500 text-sm">
                                        <Lock size={20} className="mx-auto mb-2 text-gray-400" />
                                        No items available for your role or matching your search
                                    </div>
                                ) : (
                                    filteredItems.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => handleSelectItem(item)}
                                            className={`w-full text-left px-4 py-3 hover:bg-primary/10 flex items-center justify-between transition-colors ${selectedItem?.id === item.id ? 'bg-primary/10' : ''
                                                }`}
                                        >
                                            <div>
                                                <p className="font-medium text-gray-800">{item.name}</p>
                                                <p className="text-xs text-gray-500">{item.category} • {item.location}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-xs font-medium text-emerald-600">{item.quantity} available</span>
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}

                        {selectedItem && (
                            <div className="flex items-center gap-2 mt-2 p-2 bg-emerald-50 rounded-lg">
                                <Check size={16} className="text-emerald-600" />
                                <span className="text-sm text-emerald-700">Selected: {selectedItem.name}</span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedItem(null);
                                        setItemSearch('');
                                        setFormData({ ...formData, itemName: '', item: null });
                                    }}
                                    className="ml-auto text-emerald-600 hover:text-emerald-800"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Requested By</label>
                        <div className="px-4 py-3 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-300">
                            {user?.fullName || 'Unknown User'}
                        </div>
                    </div>

                    <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        max={selectedItem?.quantity || 99}
                        required
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    />

                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Purpose *</label>
                        <textarea
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none resize-none"
                            rows="3"
                            required
                            value={formData.purpose}
                            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                            placeholder="Describe the purpose of this request"
                        />
                    </div>


                    <div className="flex gap-3 pt-4">
                        <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1">
                            Submit Request
                        </Button>
                    </div>
                </form>
            </Modal>

            <Modal
                isOpen={rejectModalOpen}
                onClose={() => setRejectModalOpen(false)}
                title="Reject Request"
                description="Please provide a reason for rejecting this request"
                size="sm"
            >
                <div className="space-y-4">
                    <textarea
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                        rows="3"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Enter rejection reason"
                    />
                    <div className="flex gap-3">
                        <Button type="button" variant="ghost" className="flex-1" onClick={() => setRejectModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="danger" className="flex-1" onClick={handleRejectConfirm}>
                            Reject Request
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={cancelModalOpen}
                onClose={() => setCancelModalOpen(false)}
                title="Cancel Request"
                description="Are you sure you want to cancel this request?"
                size="sm"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700/50">
                        <p className="text-sm text-amber-800 dark:text-amber-300 text-center">
                            This action cannot be undone. The request will be permanently cancelled.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button type="button" variant="ghost" className="flex-1" onClick={() => setCancelModalOpen(false)}>
                            Keep Request
                        </Button>
                        <Button variant="danger" className="flex-1" onClick={handleCancelConfirm}>
                            <Ban size={16} className="mr-2" />
                            Cancel Request
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Request details modal */}
            <Modal
                isOpen={detailModalOpen}
                onClose={() => {
                    setDetailModalOpen(false);
                    setDetailRequest(null);
                }}
                title="Request Details"
                description="Full information about this request"
                size="lg"
            >
                {detailRequest && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[detailRequest.status]}`}>
                                    {detailRequest.status?.replace('_', ' ')}
                                </span>
                                <PriorityBadge priority={detailRequest.priority} />
                                {detailRequest.isOverdue && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                        <AlertTriangle size={12} />
                                        OVERDUE
                                    </span>
                                )}
                            </div>
                            <span className="text-sm text-gray-500">ID: #{detailRequest.id}</span>
                        </div>

                        <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                            <div className="flex items-center gap-3">
                                <Package className="text-primary" size={22} />
                                <div>
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-100">{detailRequest.itemName}</h4>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Quantity: {detailRequest.quantity}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <User className="text-blue-600" size={18} />
                                <div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Requested By</p>
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{detailRequest.requestedBy}</p>
                                    {detailRequest.requestedByStudentId && (
                                        <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400">Student ID: {detailRequest.requestedByStudentId}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                                <Calendar className="text-amber-600" size={18} />
                                <div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Request Date</p>
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                                        {detailRequest.requestDate}
                                        {detailRequest.createdAt && (
                                            <span className="text-xs text-gray-400 ml-1">
                                                {new Date(detailRequest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {detailRequest.isReturnable && (
                            <div className="grid grid-cols-2 gap-3">
                                {detailRequest.borrowDuration && (
                                    <div className="flex items-center gap-2 p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                                        <Timer className="text-purple-600" size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Borrow Limit</p>
                                            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                                                {detailRequest.borrowDuration} {detailRequest.borrowDurationUnit?.toLowerCase()}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {detailRequest.expectedReturn && (
                                    <div className={`flex items-center gap-2 p-2.5 rounded-lg ${detailRequest.isOverdue
                                        ? 'bg-red-50 dark:bg-red-900/20 border border-red-200'
                                        : 'bg-green-50 dark:bg-green-900/20'
                                        }`}>
                                        <Clock className={detailRequest.isOverdue ? 'text-red-600' : 'text-green-600'} size={18} />
                                        <div>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Due Date</p>
                                            <p className={`text-sm font-medium ${detailRequest.isOverdue ? 'text-red-700' : 'text-gray-800 dark:text-gray-100'}`}>
                                                {new Date(detailRequest.expectedReturn).toLocaleDateString()} {new Date(detailRequest.expectedReturn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-3 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                                <FileText className="text-primary" size={16} />
                                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Purpose</h4>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                                {detailRequest.purpose || 'No purpose specified'}
                            </p>
                        </div>

                        {detailRequest.autoNote && (
                            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText className="text-indigo-600 dark:text-indigo-400" size={18} />
                                    <h4 className="font-semibold text-indigo-700 dark:text-indigo-300">
                                        {detailRequest.autoDecided ? 'Auto-decision (by rules)' : 'AI recommendation'}
                                    </h4>
                                    {detailRequest.autoRecommendation && (
                                        <span className="ml-auto rounded-full bg-indigo-100 dark:bg-indigo-800/50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                            {detailRequest.autoRecommendation}
                                        </span>
                                    )}
                                </div>
                                <p className="text-indigo-700 dark:text-indigo-300 text-sm leading-relaxed">
                                    {detailRequest.autoNote}
                                </p>
                            </div>
                        )}

                        {detailRequest.status === 'REJECTED' && detailRequest.rejectionReason && (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                                <div className="flex items-center gap-2 mb-2">
                                    <X className="text-red-600" size={18} />
                                    <h4 className="font-semibold text-red-700 dark:text-red-400">Rejection Reason</h4>
                                </div>
                                <p className="text-red-600 dark:text-red-300 text-sm">
                                    {detailRequest.rejectionReason}
                                </p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4 border-t dark:border-gray-600">
                            {detailRequest.status === 'PENDING' && hasMinRole(user?.role, ROLES.STAFF) && detailRequest.requestedById !== user?.id && (
                                <>
                                    <Button
                                        className="flex-1"
                                        onClick={() => {
                                            handleApprove(detailRequest.id);
                                            setDetailModalOpen(false);
                                        }}
                                    >
                                        <Check size={16} className="mr-2" />
                                        Approve
                                    </Button>
                                    <Button
                                        variant="danger"
                                        className="flex-1"
                                        onClick={() => {
                                            setDetailModalOpen(false);
                                            handleRejectClick(detailRequest.id);
                                        }}
                                    >
                                        <X size={16} className="mr-2" />
                                        Reject
                                    </Button>
                                </>
                            )}
                            {detailRequest.status !== 'PENDING' && (
                                <Button variant="ghost" className="flex-1" onClick={() => setDetailModalOpen(false)}>
                                    Close
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default Requests;
