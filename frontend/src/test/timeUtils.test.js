import { describe, expect, it } from 'vitest';
import { formatCompactDuration, formatShortRelativeTime, formatTimeAgo, getOverdueAge } from '../utils/timeUtils';

describe('time utilities', () => {
    it('formats compact durations for countdown badges', () => {
        expect(formatCompactDuration(65 * 60 * 1000)).toBe('1h 5m');
        expect(formatCompactDuration(2 * 24 * 60 * 60 * 1000)).toBe('2d 0h');
    });

    it('calculates overdue age once for history and reports', () => {
        expect(getOverdueAge('2026-06-01T00:00:00Z', '2026-06-03T03:00:00Z')).toEqual({
            diffMs: 51 * 60 * 60 * 1000,
            daysOverdue: 2,
            hoursOverdue: 51,
        });
    });

    it('formats notification ages', () => {
        expect(formatTimeAgo('2026-06-03T00:00:00Z', '2026-06-03T00:45:00Z')).toBe('45m ago');
    });

    it('formats short relative message times', () => {
        expect(formatShortRelativeTime('2026-06-03T00:00:00Z', '2026-06-03T02:00:00Z')).toBe('2h');
    });
});
