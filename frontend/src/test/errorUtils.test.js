import { describe, it, expect } from 'vitest';
import { formatApiError } from '../utils/errorUtils';

describe('formatApiError', () => {
    it('returns fallback when error has no response', () => {
        expect(formatApiError(new Error('net fail'), 'Oops')).toBe('Oops');
    });

    it('returns detail string from DRF response', () => {
        const err = { response: { data: { detail: 'Not found.' } } };
        expect(formatApiError(err)).toBe('Not found.');
    });

    it('returns error string from custom backend key', () => {
        const err = { response: { data: { error: 'Rate limited' } } };
        expect(formatApiError(err)).toBe('Rate limited');
    });

    it('flattens field-level validation errors', () => {
        const err = { response: { data: { email: ['Invalid email'], username: ['Already taken'] } } };
        expect(formatApiError(err)).toBe('email: Invalid email. username: Already taken');
    });

    it('returns fallback when data is empty object', () => {
        const err = { response: { data: {} } };
        expect(formatApiError(err, 'Fallback')).toBe('Fallback');
    });

    it('uses default fallback when none provided', () => {
        expect(formatApiError(null)).toBe('Something went wrong');
    });
});
