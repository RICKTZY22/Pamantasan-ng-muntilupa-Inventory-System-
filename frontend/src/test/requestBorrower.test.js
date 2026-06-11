import { describe, expect, it } from 'vitest';
import { getCreditTone, normalizeRequestBorrower } from '../utils/requestBorrower';

describe('request borrower helpers', () => {
    it('uses borrower payload when present', () => {
        expect(normalizeRequestBorrower({
            requestedBy: 'Fallback Name',
            requestedById: 1,
            borrower: {
                id: 2,
                fullName: 'Maria Santos',
                email: 'maria@plmun.edu.ph',
                studentId: '23149842',
                creditScore: 95,
            },
        })).toMatchObject({
            id: 2,
            fullName: 'Maria Santos',
            email: 'maria@plmun.edu.ph',
            studentId: '23149842',
            creditScore: 95,
        });
    });

    it('falls back to legacy request fields', () => {
        expect(normalizeRequestBorrower({
            requestedBy: 'Legacy Student',
            requestedById: 7,
            requestedByStudentId: '23140001',
        })).toMatchObject({
            id: 7,
            fullName: 'Legacy Student',
            studentId: '23140001',
            isActive: true,
        });
    });

    it('maps credit score tones', () => {
        expect(getCreditTone(100)).toBe('good');
        expect(getCreditTone(90)).toBe('warning');
        expect(getCreditTone(75)).toBe('danger');
        expect(getCreditTone(null)).toBe('neutral');
    });
});
