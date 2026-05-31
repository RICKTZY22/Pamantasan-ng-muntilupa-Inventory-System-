import { GraduationCap, Briefcase, Shield, ShieldCheck } from '@phosphor-icons/react';
import { ROLES } from '../../utils/roles';

// Single source of truth for role visuals (label, icon, avatar gradient, badge).
// Replaces the duplicated ROLE_META that used to live in the Settings Users tab.
export const ROLE_META = {
    [ROLES.STUDENT]: {
        label: 'Student',
        Icon: GraduationCap,
        gradient: 'from-blue-500 to-blue-600',
        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    },
    [ROLES.FACULTY]: {
        label: 'Faculty',
        Icon: Briefcase,
        gradient: 'from-violet-500 to-violet-600',
        badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    },
    [ROLES.STAFF]: {
        label: 'Staff',
        Icon: Shield,
        gradient: 'from-amber-500 to-amber-600',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    },
    [ROLES.ADMIN]: {
        label: 'Administrator',
        Icon: ShieldCheck,
        gradient: 'from-red-500 to-red-600',
        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    },
};

export const getRoleMeta = (role) => ROLE_META[role] || ROLE_META[ROLES.STUDENT];
