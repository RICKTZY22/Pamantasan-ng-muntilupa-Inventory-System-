export const MS_PER_MINUTE = 60 * 1000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

const toTime = (value) => {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
};

// Compact labels for badges and countdowns.
export const formatCompactDuration = (ms) => {
    if (ms <= 0) return 'OVERDUE';

    const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

// Shared overdue math for history/report views.
export const getOverdueAge = (expectedReturn, now = new Date()) => {
    const dueTime = toTime(expectedReturn);
    const nowTime = toTime(now);
    if (dueTime === null || nowTime === null) {
        return { daysOverdue: 0, hoursOverdue: 0, diffMs: 0 };
    }

    const diffMs = Math.max(0, nowTime - dueTime);
    return {
        diffMs,
        daysOverdue: Math.floor(diffMs / MS_PER_DAY),
        hoursOverdue: Math.floor(diffMs / MS_PER_HOUR),
    };
};

// Friendly notification labels, e.g. "Just now" or "2h ago".
export const formatTimeAgo = (dateStr, now = Date.now()) => {
    const time = toTime(dateStr);
    if (time === null) return '';

    const nowTime = typeof now === 'number' ? now : toTime(now);
    const diff = Math.max(0, (nowTime ?? Date.now()) - time);

    if (diff < MS_PER_MINUTE) return 'Just now';
    if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m ago`;
    if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h ago`;

    return new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Short chat-list labels, e.g. "now", "5m", "Thu".
export const formatShortRelativeTime = (dateStr, now = Date.now()) => {
    const time = toTime(dateStr);
    if (time === null) return '';

    const nowTime = typeof now === 'number' ? now : toTime(now);
    const diff = Math.max(0, (nowTime ?? Date.now()) - time);
    const date = new Date(time);

    if (diff < MS_PER_MINUTE) return 'now';
    if (diff < MS_PER_HOUR) return `${Math.floor(diff / MS_PER_MINUTE)}m`;
    if (diff < MS_PER_DAY) return `${Math.floor(diff / MS_PER_HOUR)}h`;
    if (diff < 7 * MS_PER_DAY) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
