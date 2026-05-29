import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { Tray } from '@phosphor-icons/react';
import { Card } from '../ui';
import RequestProgressBar from '../ui/RequestProgressBar';

const STATUS_PILL = {
    PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    APPROVED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    RETURNED: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400',
};

// Rotating soft tints for the initials avatar, picked deterministically by name.
const AVATAR_TINTS = [
    'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400',
];

const initials = (name = '') => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const tintFor = (name = '') => {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % AVATAR_TINTS.length;
    return AVATAR_TINTS[hash];
};

// Compact "recent requests" panel: initials avatar + requester + item + status,
// with either a status pill (staff view) or a compact progress bar (student view).
const RecentRequestsTable = ({ title, rows, showProgress = false, viewAllTo = '/requests', emptyMessage = 'No requests yet' }) => (
    <Card>
        <Card.Header>
            <Card.Title>{title}</Card.Title>
            {viewAllTo && rows.length > 0 && (
                <Link to={viewAllTo} className="text-xs font-semibold text-[var(--accent)] hover:underline">
                    View all
                </Link>
            )}
        </Card.Header>
        <Card.Content>
            {rows.length === 0 ? (
                <div className="text-center py-8">
                    <Tray size={32} weight="duotone" className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
                </div>
            ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {rows.map((row) => {
                        const seed = row.requester || row.item || '';
                        const secondary = [row.requester, row.date].filter(Boolean).join(' · ');
                        return (
                        <div key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                            <span className={`flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold flex-shrink-0 ${tintFor(seed)}`}>
                                {initials(seed)}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.item}</p>
                                {secondary && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{secondary}</p>}
                            </div>
                            {showProgress ? (
                                <div className="flex-shrink-0 hidden sm:block">
                                    <RequestProgressBar status={row.status} compact />
                                </div>
                            ) : (
                                <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_PILL[row.status] || STATUS_PILL.CANCELLED}`}>
                                    {row.status?.charAt(0) + row.status?.slice(1).toLowerCase()}
                                </span>
                            )}
                            {row.to && (
                                <Link
                                    to={row.to}
                                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/60 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                >
                                    View
                                </Link>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}
        </Card.Content>
    </Card>
);

RecentRequestsTable.propTypes = {
    title: PropTypes.string,
    showProgress: PropTypes.bool,
    viewAllTo: PropTypes.string,
    emptyMessage: PropTypes.string,
    rows: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        requester: PropTypes.string,
        item: PropTypes.string,
        status: PropTypes.string,
        date: PropTypes.string,
        to: PropTypes.string,
    })).isRequired,
};

export default RecentRequestsTable;
