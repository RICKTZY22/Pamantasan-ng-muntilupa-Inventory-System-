import { describe, expect, it } from 'vitest';
import { isHistoryOverdue } from '../utils/requestHistory';

describe('request history overdue filtering', () => {
    it('trusts the backend isOverdue flag, including RETURN_PENDING requests', () => {
        expect(isHistoryOverdue({
            status: 'RETURN_PENDING',
            isOverdue: true,
            expectedReturn: '2026-06-01T00:00:00Z',
        })).toBe(true);
    });

    it('does not reimplement status/date rules on the frontend', () => {
        expect(isHistoryOverdue({
            status: 'APPROVED',
            isOverdue: false,
            expectedReturn: '2020-01-01T00:00:00Z',
        })).toBe(false);
    });
});
