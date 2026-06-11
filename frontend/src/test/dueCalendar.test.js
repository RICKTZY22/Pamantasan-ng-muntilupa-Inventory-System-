import { describe, expect, it } from 'vitest';
import { buildDueCalendarEvents, isActiveDueRequest } from '../utils/dueCalendar';

const baseRequest = {
    id: 1,
    status: 'APPROVED',
    isReturnable: true,
    expectedReturn: '2026-06-15T10:00:00',
    itemName: 'Projector',
    quantity: 2,
};

describe('due calendar helpers', () => {
    it('keeps approved and return-pending returnable requests as active due events', () => {
        expect(isActiveDueRequest(baseRequest)).toBe(true);
        expect(isActiveDueRequest({ ...baseRequest, status: 'RETURN_PENDING' })).toBe(true);
    });

    it('excludes final, non-returnable, missing-date, and cleared requests', () => {
        expect(isActiveDueRequest({ ...baseRequest, status: 'COMPLETED' })).toBe(false);
        expect(isActiveDueRequest({ ...baseRequest, status: 'RETURNED' })).toBe(false);
        expect(isActiveDueRequest({ ...baseRequest, status: 'REJECTED' })).toBe(false);
        expect(isActiveDueRequest({ ...baseRequest, status: 'CANCELLED' })).toBe(false);
        expect(isActiveDueRequest({ ...baseRequest, isReturnable: false })).toBe(false);
        expect(isActiveDueRequest({ ...baseRequest, expectedReturn: null })).toBe(false);
        expect(isActiveDueRequest({ ...baseRequest, isCleared: true })).toBe(false);
    });

    it('builds sorted due events with staff borrower context', () => {
        const events = buildDueCalendarEvents([
            {
                ...baseRequest,
                id: 2,
                expectedReturn: '2026-06-20T10:00:00',
                borrower: { fullName: 'Ana Santos' },
            },
            {
                ...baseRequest,
                id: 1,
                expectedReturn: '2026-06-15T10:00:00',
                requestedBy: 'Ben Cruz',
            },
        ], {
            includeBorrower: true,
            now: new Date('2026-06-10T00:00:00'),
        });

        expect(events.map((event) => event.requestId)).toEqual([1, 2]);
        expect(events[0]).toMatchObject({
            dayKey: '2026-06-15',
            borrowerName: 'Ben Cruz',
            itemName: 'Projector',
            quantity: 2,
            isOverdue: false,
        });
        expect(events[1].borrowerName).toBe('Ana Santos');
    });

    it('marks due events overdue against the provided clock', () => {
        const [event] = buildDueCalendarEvents([baseRequest], {
            now: new Date('2026-06-16T00:00:00'),
        });

        expect(event.isOverdue).toBe(true);
    });
});
