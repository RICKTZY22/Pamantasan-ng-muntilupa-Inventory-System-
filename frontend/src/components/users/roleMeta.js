import { GraduationCap, Briefcase, Shield, ShieldCheck } from '@phosphor-icons/react';
import { ROLES, getRoleLabel, getRoleBadgeColor } from '../../utils/roles';

// Single source of truth for role visuals. Label + badge colors come from
// utils/roles (shared with ProfileTab/Users so every surface stays consistent);
// only the icon and avatar gradient are component-specific and defined here.
const ICONS_GRADIENTS = {
    [ROLES.STUDENT]: { Icon: GraduationCap, gradient: 'from-blue-500 to-blue-600' },
    [ROLES.FACULTY]: { Icon: Briefcase, gradient: 'from-violet-500 to-violet-600' },
    [ROLES.STAFF]: { Icon: Shield, gradient: 'from-amber-500 to-amber-600' },
    [ROLES.ADMIN]: { Icon: ShieldCheck, gradient: 'from-red-500 to-red-600' },
};

export const ROLE_META = Object.fromEntries(
    Object.values(ROLES).map((role) => [role, {
        label: getRoleLabel(role),
        badge: getRoleBadgeColor(role),
        ...ICONS_GRADIENTS[role],
    }])
);

export const getRoleMeta = (role) => ROLE_META[role] || ROLE_META[ROLES.STUDENT];
