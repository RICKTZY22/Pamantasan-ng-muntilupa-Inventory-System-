import { useEffect, useCallback, useRef, useState } from 'react';
import notificationService from '../services/notificationService';
import useNotificationStore, { selectUnreadCount } from '../store/notificationStore';

// Notifications arrive live over the chat WebSocket (see chatSocket.js).
// This slow poll is only a safety net for events missed during a socket gap —
// the WS reconnect handler already resyncs, so 60s is plenty (was 5s polling).
const SAFETY_POLL_INTERVAL = 60000;

const hasToken = () => {
    try {
        const stored = localStorage.getItem('auth-storage');
        const parsed = stored ? JSON.parse(stored) : null;
        // Tokens are no longer persisted (access is in memory, refresh is an
        // HttpOnly cookie). Gate the safety poll on the persisted auth flag.
        return Boolean(parsed?.state?.isAuthenticated);
    } catch { return false; }
};

const useNotifications = () => {
    const notifications = useNotificationStore((s) => s.notifications);
    const unreadCount = useNotificationStore(selectUnreadCount);
    const setAll = useNotificationStore((s) => s.setAll);
    const storeMarkRead = useNotificationStore((s) => s.markRead);
    const storeMarkAllRead = useNotificationStore((s) => s.markAllRead);
    const storeRemove = useNotificationStore((s) => s.removeOne);
    const storeClear = useNotificationStore((s) => s.clear);
    const [loading, setLoading] = useState(false);
    const intervalRef = useRef(null);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const data = await notificationService.getAll();
            setAll(Array.isArray(data) ? data : data.results || []);
        } catch {
            // empty/error state is handled by the UI; next sync will retry
        } finally {
            setLoading(false);
        }
    }, [setAll]);

    // Optimistic: update the store first for instant feedback, then persist.
    // A failed call self-heals on the next WS resync / safety poll.
    const markAsRead = useCallback(async (id) => {
        storeMarkRead(id);
        try { await notificationService.markAsRead(id); } catch { /* resyncs */ }
    }, [storeMarkRead]);

    const markAllAsRead = useCallback(async () => {
        storeMarkAllRead();
        try { await notificationService.markAllAsRead(); } catch { /* resyncs */ }
    }, [storeMarkAllRead]);

    const deleteNotification = useCallback(async (id) => {
        storeRemove(id);
        try { await notificationService.deleteOne(id); } catch { /* resyncs */ }
    }, [storeRemove]);

    const clearAll = useCallback(async () => {
        storeClear();
        try { await notificationService.clearAll(); } catch { /* resyncs */ }
    }, [storeClear]);

    useEffect(() => {
        if (!hasToken()) return;
        fetchNotifications();
        intervalRef.current = setInterval(() => {
            if (hasToken()) fetchNotifications();
            else if (intervalRef.current) clearInterval(intervalRef.current);
        }, SAFETY_POLL_INTERVAL);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [fetchNotifications]);

    return {
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
    };
};

export default useNotifications;
