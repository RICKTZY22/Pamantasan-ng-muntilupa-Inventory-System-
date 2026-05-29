import { useState, useCallback } from 'react';
import { userService } from '../services';
import { ROLES } from '../utils/roles';
import { formatApiError } from '../utils/errorUtils';

const useUsers = () => {
    // state
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        inactive: 0,
        admins: 0,
        staff: 0,
        faculty: 0,
        students: 0,
    });

    const clearError = useCallback(() => setError(null), []);

    const fetchUsers = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const data = await userService.getAll(filters);
            const rawItems = Array.isArray(data) ? data : data.results || [];

            // Serializer already returns camelCase — just ensure fullName fallback
            const items = rawItems.map(u => ({
                ...u,
                fullName: u.fullName || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username,
            }));
            setUsers(items);

            // Single-pass stats computation (was 7 separate .filter() calls)
            const counts = items.reduce((acc, u) => {
                if (u.isActive) acc.active++; else acc.inactive++;
                if (u.role === ROLES.ADMIN) acc.admins++;
                else if (u.role === ROLES.STAFF) acc.staff++;
                else if (u.role === ROLES.FACULTY) acc.faculty++;
                else acc.students++;
                return acc;
            }, { active: 0, inactive: 0, admins: 0, staff: 0, faculty: 0, students: 0 });
            setStats({ total: items.length, ...counts });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to fetch users');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const data = await userService.getStats();
            setStats({
                total: data.total || 0,
                active: data.active || 0,
                inactive: data.inactive || 0,
                admins: data.byRole?.admin || 0,
                staff: data.byRole?.staff || 0,
                faculty: data.byRole?.faculty || 0,
                students: data.byRole?.students || 0,
            });
        } catch (err) {
            // stats fetch failed — non-critical
        }
    }, []);

    const updateUserRole = useCallback(async (userId, newRole) => {
        setLoading(true);
        setError(null);
        try {
            if (!Object.values(ROLES).includes(newRole)) {
                throw new Error('Invalid role');
            }

            await userService.updateRole(userId, newRole);
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, role: newRole } : u
            ));

            return { success: true, message: 'Role updated successfully' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to update role');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const toggleUserStatus = useCallback(async (userId) => {
        setLoading(true);
        setError(null);
        try {
            const result = await userService.toggleStatus(userId);
            const isNowActive = result.user?.is_active ?? result.user?.isActive;

            // gamitin yung actual server response, hindi optimistic flip
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, isActive: isNowActive } : u
            ));
            // Update stats from actual state
            setStats(prev => {
                const newActive = prev.active + (isNowActive ? 1 : -1);
                return {
                    ...prev,
                    active: Math.max(0, newActive),
                    inactive: Math.max(0, prev.total - newActive),
                };
            });

            return { success: true, message: 'User status updated' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to update user status');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteUser = useCallback(async (userId) => {
        setLoading(true);
        setError(null);
        try {
            await userService.delete(userId);
            setUsers(prev => prev.filter(u => u.id !== userId));

            return { success: true, message: 'User deleted' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to delete user');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const unflagUser = useCallback(async (userId) => {
        setLoading(true);
        setError(null);
        try {
            const result = await userService.unflagUser(userId);
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, isFlagged: false, overdueCount: 0 } : u
            ));
            return { success: true, message: result.message };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to unflag user');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        users,
        loading,
        error,
        clearError,
        selectedUser,
        setSelectedUser,
        fetchUsers,
        fetchStats,
        updateUserRole,
        toggleUserStatus,
        deleteUser,
        unflagUser,
        stats,
    };
};

export default useUsers;
