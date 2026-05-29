/**
 * Role hierarchy — mirrors the ROLE_HIERARCHY dict on the Django User model.
 * We keep a frontend copy so RoleGuard and the sidebar can do instant
 * client-side checks without waiting for an API round trip.
 * 
 * If you add a new role, update BOTH this file and authentication/models.py.
 * Yes it's duplicated — we tried fetching roles from the API but it added
 * a loading state to every protected component. Wasn't worth it.
 */

export const ROLES = {
    STUDENT: 'STUDENT',
    FACULTY: 'FACULTY',
    STAFF: 'STAFF',
    ADMIN: 'ADMIN'
};

export const ROLE_HIERARCHY = {
    [ROLES.STUDENT]: 1,
    [ROLES.FACULTY]: 2,
    [ROLES.STAFF]: 3,
    [ROLES.ADMIN]: 4
};

// Default to 999 (not 0) for unknown required roles so that
// a typo like hasMinRole(role, 'SUPERADMIN') fails closed
// rather than granting access.
export const hasMinRole = (userRole, requiredRole) => {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 999;
    return userLevel >= requiredLevel;
};

export const hasRole = (userRole, allowedRoles) => {
    return allowedRoles.includes(userRole);
};

export const isAdmin = (userRole) => userRole === ROLES.ADMIN;
export const isStaffOrAbove = (userRole) => hasMinRole(userRole, ROLES.STAFF);

export const getRoleLabel = (role) => {
    const labels = {
        [ROLES.STUDENT]: 'Student',
        [ROLES.FACULTY]: 'Faculty',
        [ROLES.STAFF]: 'Staff',
        [ROLES.ADMIN]: 'Administrator'
    };
    return labels[role] || 'Unknown';
};

export const getRoleBadgeColor = (role) => {
    const colors = {
        [ROLES.STUDENT]: 'bg-purple-100 text-purple-700',
        [ROLES.FACULTY]: 'bg-yellow-100 text-yellow-700',
        [ROLES.STAFF]: 'bg-blue-100 text-blue-700',
        [ROLES.ADMIN]: 'bg-green-100 text-green-700'
    };
    return colors[role] || 'bg-gray-100 text-gray-700';
};

// Permissions matrix — we define all of these upfront rather than
// scattering them across components because it makes it easy to
// answer "what can a FACULTY user do?" in one glance.
// The trade-off is that adding new features means touching this file,
// but that's actually a feature: it forces you to think about access.
export const PERMISSIONS = {
    // Profile
    VIEW_PROFILE: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    EDIT_PROFILE: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],

    // Inventory
    VIEW_INVENTORY: [ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    EDIT_INVENTORY: [ROLES.STAFF, ROLES.ADMIN],
    DELETE_INVENTORY: [ROLES.STAFF, ROLES.ADMIN],

    // Requests
    VIEW_AVAILABLE_ITEMS: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    CREATE_REQUEST: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    VIEW_OWN_REQUESTS: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    CANCEL_OWN_REQUEST: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    VIEW_ALL_REQUESTS: [ROLES.STAFF, ROLES.ADMIN],
    APPROVE_REQUEST: [ROLES.STAFF, ROLES.ADMIN],

    // Dashboard
    VIEW_DASHBOARD: [ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],

    // Reports
    VIEW_REPORTS: [ROLES.STAFF, ROLES.ADMIN],
    EXPORT_REPORTS: [ROLES.STAFF, ROLES.ADMIN],

    // Settings
    VIEW_SETTINGS: [ROLES.STUDENT, ROLES.FACULTY, ROLES.STAFF, ROLES.ADMIN],
    SYSTEM_SETTINGS: [ROLES.STAFF, ROLES.ADMIN],
    ADMIN_SETTINGS: [ROLES.ADMIN],

    // User Management
    VIEW_USERS: [ROLES.ADMIN],
    EDIT_USERS: [ROLES.ADMIN],
    DEACTIVATE_USERS: [ROLES.ADMIN],
    DELETE_USERS: [ROLES.ADMIN],
    ASSIGN_ROLES: [ROLES.ADMIN],
};

export const hasPermission = (userRole, permission) => {
    const allowedRoles = PERMISSIONS[permission];
    if (!allowedRoles) return false;
    return allowedRoles.includes(userRole);
};

export default {
    ROLES,
    ROLE_HIERARCHY,
    hasMinRole,
    hasRole,
    isAdmin,
    isStaffOrAbove,
    getRoleLabel,
    getRoleBadgeColor,
    PERMISSIONS,
    hasPermission
};
