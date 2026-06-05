import { useState, useCallback } from 'react';
import { requestService } from '../services';
import { formatApiError } from '../utils/errorUtils';

// Avoid running the overdue scan on every page mount.
const OVERDUE_SCAN_COOLDOWN_MS = 10 * 60 * 1000;
let lastOverdueScanAt = 0;

// Basic counters for loaded request rows.
const buildStats = (items) => {
    const init = { total: 0, pending: 0, approved: 0, rejected: 0, completed: 0, returned: 0, overdue: 0 };
    return items.reduce((acc, r) => {
        acc.total++;
        if (r.status === 'PENDING') acc.pending++;
        else if (r.status === 'APPROVED') acc.approved++;
        else if (r.status === 'REJECTED') acc.rejected++;
        else if (r.status === 'COMPLETED') acc.completed++;
        else if (r.status === 'RETURNED') acc.returned++;
        if (r.isOverdue) acc.overdue++;
        return acc;
    }, init);
};

const useRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [stats, setStats] = useState(buildStats([]));
    const [totalCount, setTotalCount] = useState(0);
    const [popularItems, setPopularItems] = useState([]);
    const [overdueGroups, setOverdueGroups] = useState([]);

    const clearError = useCallback(() => setError(null), []);

    const fetchRequests = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const data = await requestService.getAll(filters);
            const items = Array.isArray(data) ? data : data.results || [];
            setRequests(items);
            setStats(buildStats(items));
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch one server-paginated page for the Requests page.
    const fetchPage = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const data = await requestService.listPage(filters);
            if (Array.isArray(data)) {
                setRequests(data);
                setTotalCount(data.length);
            } else {
                setRequests(data.results || []);
                setTotalCount(typeof data.count === 'number' ? data.count : (data.results || []).length);
            }
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async (range) => {
        try {
            const data = await requestService.getStats(range);
            setStats(data);
        } catch (err) {
            // Stats are helpful, but not required for the page to work.
        }
    }, []);

    // Reports-only: server-aggregated popular items + overdue grouped by borrower.
    const fetchPopularItems = useCallback(async (range) => {
        try {
            setPopularItems(await requestService.getPopularItems(range));
        } catch (err) {
            setPopularItems([]);
        }
    }, []);

    const fetchOverdueGrouped = useCallback(async (search = '') => {
        try {
            setOverdueGroups(await requestService.getOverdueGrouped(search));
        } catch (err) {
            setOverdueGroups([]);
        }
    }, []);

    const checkOverdue = useCallback(async () => {
        // Skip if a scan ran recently.
        const now = Date.now();
        if (now - lastOverdueScanAt < OVERDUE_SCAN_COOLDOWN_MS) return null;
        lastOverdueScanAt = now;
        try {
            return await requestService.checkOverdue();
        } catch (err) {
            return null;
        }
    }, []);

    const createRequest = useCallback(async (request) => {
        setLoading(true);
        setError(null);
        try {
            const newRequest = await requestService.create(request);
            setRequests(prev => [newRequest, ...prev]);
            setStats(prev => ({
                ...prev,
                total: prev.total + 1,
                pending: prev.pending + (newRequest.status === 'PENDING' ? 1 : 0),
                overdue: prev.overdue + (newRequest.isOverdue ? 1 : 0),
            }));
            return { success: true, request: newRequest, message: 'Request submitted successfully' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to create request');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const handleAction = useCallback(async (action, successMsg, failMsg) => {
        setLoading(true);
        setError(null);
        try {
            await action();
            // Requests page reloads the current server page after actions.
            return { success: true, message: successMsg };
        } catch (err) {
            const errorMessage = err.response?.data?.detail || err.response?.data?.error || failMsg;
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const approveRequest = useCallback((id) =>
        handleAction(() => requestService.approve(id), 'Request approved successfully', 'Failed to approve request'),
        [handleAction]);

    const rejectRequest = useCallback((id, reason = '') =>
        handleAction(() => requestService.reject(id, reason), 'Request rejected', 'Failed to reject request'),
        [handleAction]);

    const completeRequest = useCallback((id) =>
        handleAction(() => requestService.complete(id), 'Request marked as completed', 'Failed to complete request'),
        [handleAction]);

    // Step 1: borrower (or staff) signals the item is being returned.
    const returnRequest = useCallback((id) =>
        handleAction(() => requestService.requestReturn(id), 'Return started — awaiting staff confirmation', 'Failed to start return'),
        [handleAction]);

    // Step 2: staff confirms physical receipt → item is actually returned.
    const confirmReturn = useCallback((id) =>
        handleAction(() => requestService.confirmReturn(id), 'Return confirmed — item received', 'Failed to confirm return'),
        [handleAction]);

    // Undo a pending return (requested by mistake / item not actually handed over).
    const cancelReturn = useCallback((id) =>
        handleAction(() => requestService.cancelReturn(id), 'Pending return cancelled', 'Failed to cancel return'),
        [handleAction]);

    const clearCompleted = useCallback(() =>
        handleAction(() => requestService.clearCompleted(), 'Completed requests cleared', 'Failed to clear requests'),
        [handleAction]);

    const cancelRequest = useCallback((id) =>
        handleAction(() => requestService.cancel(id), 'Request cancelled', 'Failed to cancel request'),
        [handleAction]);

    return {
        requests,
        loading,
        error,
        clearError,
        selectedRequest,
        setSelectedRequest,
        fetchRequests,
        fetchPage,
        totalCount,
        fetchStats,
        popularItems,
        overdueGroups,
        fetchPopularItems,
        fetchOverdueGrouped,
        createRequest,
        approveRequest,
        rejectRequest,
        completeRequest,
        cancelRequest,
        returnRequest,
        confirmReturn,
        cancelReturn,
        clearCompleted,
        checkOverdue,
        stats,
    };
};

export default useRequests;
