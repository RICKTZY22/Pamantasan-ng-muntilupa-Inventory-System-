import { describe, expect, it } from 'vitest';
import { buildRequestTabParams, canCompleteRequest, canStartReturn } from '../utils/requestLifecycle';

describe('request lifecycle rules', () => {
    it('only allows starting a return from approved returnable requests', () => {
        const base = { isReturnable: true };

        expect(canStartReturn({ ...base, status: 'APPROVED' }, true, false)).toBe(true);
        expect(canStartReturn({ ...base, status: 'RETURN_PENDING' }, true, true)).toBe(false);
        expect(canStartReturn({ ...base, status: 'COMPLETED' }, true, true)).toBe(false);
        expect(canStartReturn({ ...base, status: 'RETURNED' }, true, true)).toBe(false);
    });

    it('maps the Completed tab to the final-row backend filter', () => {
        expect(buildRequestTabParams({
            activeTab: 'COMPLETED',
            viewMode: 'all',
            search: 'projector',
        })).toEqual({
            mine: false,
            search: 'projector',
            completed: true,
        });
    });

    it('does not send a status filter for the staff All tab', () => {
        expect(buildRequestTabParams({
            activeTab: 'ALL',
            viewMode: 'all',
            search: '23149842',
        })).toEqual({
            mine: false,
            search: '23149842',
        });
    });

    it('only allows staff to complete approved non-returnable requests', () => {
        expect(canCompleteRequest({ status: 'APPROVED', isReturnable: false }, true)).toBe(true);
        expect(canCompleteRequest({ status: 'APPROVED', isReturnable: false }, false)).toBe(false);
        expect(canCompleteRequest({ status: 'APPROVED', isReturnable: true }, true)).toBe(false);
        expect(canCompleteRequest({ status: 'COMPLETED', isReturnable: false }, true)).toBe(false);
    });
});
