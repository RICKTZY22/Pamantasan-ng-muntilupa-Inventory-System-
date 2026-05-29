import { describe, it, expect } from 'vitest';
import {
    ROLES,
    ROLE_HIERARCHY,
    hasMinRole,
    hasRole,
    isAdmin,
    isStaffOrAbove,
    hasPermission,
    getRoleLabel,
} from '../utils/roles';

describe('roles utilities', () => {
    describe('ROLE_HIERARCHY', () => {
        it('orders STUDENT < FACULTY < STAFF < ADMIN', () => {
            expect(ROLE_HIERARCHY[ROLES.STUDENT]).toBeLessThan(ROLE_HIERARCHY[ROLES.FACULTY]);
            expect(ROLE_HIERARCHY[ROLES.FACULTY]).toBeLessThan(ROLE_HIERARCHY[ROLES.STAFF]);
            expect(ROLE_HIERARCHY[ROLES.STAFF]).toBeLessThan(ROLE_HIERARCHY[ROLES.ADMIN]);
        });
    });

    describe('hasMinRole', () => {
        it('ADMIN has min role STUDENT', () => {
            expect(hasMinRole(ROLES.ADMIN, ROLES.STUDENT)).toBe(true);
        });

        it('STUDENT does NOT have min role STAFF', () => {
            expect(hasMinRole(ROLES.STUDENT, ROLES.STAFF)).toBe(false);
        });

        it('returns false for unknown roles', () => {
            expect(hasMinRole('UNKNOWN', ROLES.STUDENT)).toBe(false);
        });
    });

    describe('hasRole', () => {
        it('returns true when role is in allowed list', () => {
            expect(hasRole(ROLES.STAFF, [ROLES.STAFF, ROLES.ADMIN])).toBe(true);
        });

        it('returns false when role is not in allowed list', () => {
            expect(hasRole(ROLES.STUDENT, [ROLES.STAFF, ROLES.ADMIN])).toBe(false);
        });
    });

    describe('isAdmin / isStaffOrAbove', () => {
        it('isAdmin returns true only for ADMIN', () => {
            expect(isAdmin(ROLES.ADMIN)).toBe(true);
            expect(isAdmin(ROLES.STAFF)).toBe(false);
        });

        it('isStaffOrAbove returns true for STAFF and ADMIN', () => {
            expect(isStaffOrAbove(ROLES.STAFF)).toBe(true);
            expect(isStaffOrAbove(ROLES.ADMIN)).toBe(true);
            expect(isStaffOrAbove(ROLES.FACULTY)).toBe(false);
        });
    });

    describe('hasPermission', () => {
        it('STAFF can delete inventory (ARCH-04 fix)', () => {
            expect(hasPermission(ROLES.STAFF, 'DELETE_INVENTORY')).toBe(true);
        });

        it('STUDENT cannot edit inventory', () => {
            expect(hasPermission(ROLES.STUDENT, 'EDIT_INVENTORY')).toBe(false);
        });

        it('returns false for unknown permission', () => {
            expect(hasPermission(ROLES.ADMIN, 'DOES_NOT_EXIST')).toBe(false);
        });

        it('STAFF can export reports (ARCH-04 fix)', () => {
            expect(hasPermission(ROLES.STAFF, 'EXPORT_REPORTS')).toBe(true);
        });
    });

    describe('getRoleLabel', () => {
        it('returns "Administrator" for ADMIN', () => {
            expect(getRoleLabel(ROLES.ADMIN)).toBe('Administrator');
        });

        it('returns "Unknown" for invalid role', () => {
            expect(getRoleLabel('INVALID')).toBe('Unknown');
        });
    });
});
