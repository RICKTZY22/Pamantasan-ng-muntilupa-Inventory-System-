import { create } from 'zustand';

// Single source of truth for in-app notifications. Fed by a REST fetch on
// login/reconnect and by live `notification.new` events over the chat socket.
// Kept out of persist on purpose — it's live/session data.
const useNotificationStore = create((set) => ({
    notifications: [],

    setAll: (list) => set({ notifications: Array.isArray(list) ? list : [] }),

    // Upsert by id so a live WS push and a REST fetch can never render the same
    // notification twice (also makes reconnect re-delivery idempotent).
    addOne: (n) => set((s) => {
        if (!n || n.id == null) return {};
        if (s.notifications.some((x) => x.id === n.id)) {
            return { notifications: s.notifications.map((x) => (x.id === n.id ? { ...x, ...n } : x)) };
        }
        return { notifications: [n, ...s.notifications] };
    }),

    markRead: (id) => set((s) => ({
        notifications: s.notifications.map((x) => (x.id === id ? { ...x, isRead: true } : x)),
    })),

    markAllRead: () => set((s) => ({
        notifications: s.notifications.map((x) => ({ ...x, isRead: true })),
    })),

    removeOne: (id) => set((s) => ({
        notifications: s.notifications.filter((x) => x.id !== id),
    })),

    clear: () => set({ notifications: [] }),
}));

export const selectUnreadCount = (s) => s.notifications.filter((n) => !n.isRead).length;

export default useNotificationStore;
