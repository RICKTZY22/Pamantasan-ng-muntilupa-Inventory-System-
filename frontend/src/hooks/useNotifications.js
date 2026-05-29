import { useState, useEffect, useCallback, useRef } from 'react';
import notificationService from '../services/notificationService';

// dropped from 10s to 5s — users were complaining notifs felt "late"
const POLL_INTERVAL = 5000;

const useNotifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const intervalRef = useRef(null);
    const hasFetchedOnce = useRef(false);

    const fetchNotifications = useCallback(async () => {
        try {
            // only show the spinner on the very first load,
            // otherwise the dropdown flickers every 5s which is annoying
            if (!hasFetchedOnce.current) setLoading(true);

            const data = await notificationService.getAll();
            const list = Array.isArray(data) ? data : data.results || [];
            setNotifications(list);
            setUnreadCount(list.filter(n => !n.isRead).length);
            hasFetchedOnce.current = true;
        } catch (err) {
            // swallow — UI handles empty state fine
        } finally {
            setLoading(false);
        }
    }, []);

    // lightweight poll — skips setState if nothing actually changed,
    // which avoids unnecessary re-renders in the dropdown
    const pollNotifications = useCallback(async () => {
        try {
            const data = await notificationService.getAll();
            const list = Array.isArray(data) ? data : data.results || [];
            setNotifications(prev => {
                if (prev.length !== list.length || JSON.stringify(prev.map(n => n.id)) !== JSON.stringify(list.map(n => n.id))) {
                    return list;
                }
                const hasReadChanges = prev.some((n, i) => list[i] && n.isRead !== list[i].isRead);
                return hasReadChanges ? list : prev;
            });
            setUnreadCount(list.filter(n => !n.isRead).length);
        } catch {
            // polling failure is fine, next tick will retry
        }
    }, []);

    const markAsRead = useCallback(async (id) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.warn('Failed to mark notification as read:', err);
        }
    }, []);

    const markAllAsRead = useCallback(async () => {
        try {
            await notificationService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.warn('markAllAsRead failed:', err);
        }
    }, []);

    const deleteNotification = useCallback(async (id) => {
        try {
            await notificationService.deleteOne(id);
            setNotifications(prev => {
                const updated = prev.filter(n => n.id !== id);
                setUnreadCount(updated.filter(n => !n.isRead).length);
                return updated;
            });
        } catch (err) {
            console.warn('delete notification failed:', err);
        }
    }, []);

    const clearAll = useCallback(async () => {
        try {
            await notificationService.clearAll();
            setNotifications([]);
            setUnreadCount(0);
        } catch (err) {
            // this was silently failing before because of backend queryset bug
            console.warn('clearAll failed:', err);
        }
    }, []);

    // poll only when logged in
    useEffect(() => {
        const hasToken = () => {
            try {
                const stored = localStorage.getItem('auth-storage');
                const parsed = stored ? JSON.parse(stored) : null;
                return Boolean(parsed?.state?.token);
            } catch { return false; }
        };

        if (!hasToken()) return;

        fetchNotifications();
        intervalRef.current = setInterval(() => {
            if (hasToken()) pollNotifications();
            else clearInterval(intervalRef.current);
        }, POLL_INTERVAL);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchNotifications, pollNotifications]);

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
