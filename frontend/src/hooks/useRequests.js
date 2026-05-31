import { useState, useCallback } from 'react';
import { requestService } from '../services';
import { formatApiError } from '../utils/errorUtils';

// stats calculator - ino-update 'to every time may action sa request
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

    const clearError = useCallback(() => setError(null), []);

    // i-fetch lahat ng requests at i-recalculate yung stats
    const refreshAll = useCallback(async () => {
        const data = await requestService.getAll();
        const items = Array.isArray(data) ? data : data.results || [];
        setRequests(items);
        setStats(buildStats(items));
        return items;
    }, []);

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

    const fetchStats = useCallback(async () => {
        try {
            const data = await requestService.getStats();
            setStats(data);
        } catch (err) {
            // stats fetch failed — non-critical
        }
    }, []);

    const checkOverdue = useCallback(async () => {
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
            return { success: true, request: newRequest, message: 'Request submitted successfully' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to create request');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    // generic action handler para di paulit-ulit yung try/catch sa bawat action
    // HACK: medyo malabo 'tong pattern na 'to pero gumagana naman
    const handleAction = useCallback(async (action, successMsg, failMsg) => {
        setLoading(true);
        setError(null);
        try {
            await action();
            await refreshAll();
            return { success: true, message: successMsg };
        } catch (err) {
            const errorMessage = err.response?.data?.detail || err.response?.data?.error || failMsg;
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, [refreshAll]);

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
        fetchStats,
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
