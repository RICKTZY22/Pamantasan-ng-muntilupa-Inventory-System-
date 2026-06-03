import React, { useState, useEffect } from 'react';
import { Timer, Warning as AlertTriangle } from '@phosphor-icons/react';
import { formatCompactDuration, MS_PER_HOUR } from '../../utils/timeUtils';

const DueCountdown = ({ expectedReturn, className = '' }) => {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    if (!expectedReturn) return null;

    const dueTime = new Date(expectedReturn).getTime();
    const remaining = dueTime - now;
    const isOverdue = remaining <= 0;
    const isUrgent = remaining > 0 && remaining < MS_PER_HOUR;
    const isWarning = remaining > 0 && remaining < 4 * MS_PER_HOUR;

    const label = isOverdue ? 'OVERDUE' : `Return in ${formatCompactDuration(remaining)}`;
    const Icon = isOverdue || isUrgent ? AlertTriangle : Timer;

    const colorClass = isOverdue
        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
        : isUrgent
            ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border border-orange-200 dark:border-orange-800/30'
            : isWarning
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${colorClass} ${className}`}>
            <Icon size={12} />
            {label}
        </span>
    );
};

export default DueCountdown;
