import { create } from 'zustand';

// Real-time chat state. Fed by REST bootstrap (messageService) + live WS events
// (chatSocket). Kept out of persist on purpose — it's session/live data.
const sortConvs = (list) => [...list].sort((a, b) => {
    if (a.isAssistant && !b.isAssistant) return -1;
    if (!a.isAssistant && b.isAssistant) return 1;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
});

const useChatStore = create((set) => ({
    connected: false,
    conversations: [],
    messages: {},      // convId -> [message]
    online: {},        // userId -> bool
    typing: {},        // convId -> userId|null
    activeId: null,

    setConnected: (connected) => set({ connected }),

    setConversations: (list) => set({ conversations: sortConvs(list) }),

    upsertConversation: (conv) => set((s) => {
        const rest = s.conversations.filter((c) => c.id !== conv.id);
        return { conversations: sortConvs([conv, ...rest]) };
    }),

    setMessages: (convId, list) => set((s) => ({ messages: { ...s.messages, [convId]: list } })),

    prependMessages: (convId, older) => set((s) => ({
        messages: { ...s.messages, [convId]: [...older, ...(s.messages[convId] || [])] },
    })),

    setActive: (convId) => set((s) => ({
        activeId: convId,
        conversations: s.conversations.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c)),
    })),

    // A live message arrived (mine echoed back, or the other party's).
    handleIncoming: (msg, myId) => set((s) => {
        const list = s.messages[msg.conversationId] || [];
        const messages = list.some((m) => m.id === msg.id)
            ? s.messages
            : { ...s.messages, [msg.conversationId]: [...list, msg] };

        let conv = s.conversations.find((c) => c.id === msg.conversationId);
        const isMine = msg.senderId === myId;
        const isActive = s.activeId === msg.conversationId;
        const preview = { body: msg.body, senderId: msg.senderId, hasItem: !!msg.item, createdAt: msg.createdAt };

        if (conv) {
            conv = {
                ...conv,
                lastMessage: preview,
                updatedAt: msg.createdAt,
                unreadCount: (isMine || isActive) ? (isActive ? 0 : conv.unreadCount) : (conv.unreadCount || 0) + 1,
            };
        } else {
            // New conversation started by the other party — stub it (a list
            // refresh in the hook fills in accurate details).
            conv = {
                id: msg.conversationId,
                other: isMine ? null : msg.sender,
                lastMessage: preview,
                unreadCount: isMine || isActive ? 0 : 1,
                isArchived: false,
                lastReadAt: null,
                otherReadAt: null,
                updatedAt: msg.createdAt,
                _needsRefresh: true,
            };
        }
        const rest = s.conversations.filter((c) => c.id !== msg.conversationId);
        return { messages, conversations: sortConvs([conv, ...rest]) };
    }),

    setRead: (convId, userId, lastReadAt, myId) => set((s) => ({
        conversations: s.conversations.map((c) => {
            if (c.id !== convId) return c;
            if (userId === myId) return { ...c, lastReadAt, unreadCount: 0 };
            return { ...c, otherReadAt: lastReadAt }; // other read my messages → receipts
        }),
    })),

    setTyping: (convId, userId, isTyping) => set((s) => ({
        typing: { ...s.typing, [convId]: isTyping ? userId : null },
    })),

    updateReactions: (convId, messageId, reactions) => set((s) => {
        const list = s.messages[convId];
        if (!list) return {};
        return { messages: { ...s.messages, [convId]: list.map((m) => (m.id === messageId ? { ...m, reactions } : m)) } };
    }),

    setPresence: (userId, online) => set((s) => ({ online: { ...s.online, [userId]: online } })),

    reset: () => set({ connected: false, conversations: [], messages: {}, online: {}, typing: {}, activeId: null }),
}));

export const selectUnreadTotal = (s) => s.conversations.reduce((n, c) => n + (c.unreadCount || 0), 0);

export default useChatStore;
