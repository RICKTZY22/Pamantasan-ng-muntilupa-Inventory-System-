import useChatStore from '../store/chatStore';
import useAuthStore from '../store/authStore';
import useNotificationStore from '../store/notificationStore';
import messageService from './messageService';
import notificationService from './notificationService';

// Pull the full notification list once (login + every reconnect). Reconnect
// resync matters because any notification.new events sent while the socket was
// down are lost — this catches them up. Deduped by id in the store.
const resyncNotifications = () => {
    notificationService.getAll()
        .then((data) => useNotificationStore.getState().setAll(Array.isArray(data) ? data : data.results || []))
        .catch(() => {});
};

// Singleton WebSocket client. Connects to the Channels consumer, auto-reconnects
// with backoff, and dispatches live events into the chat store.
let socket = null;
let reconnectTimer = null;
let disconnectTimer = null;
let shouldReconnect = false;
let backoff = 1000;

const wsUrl = () => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    const origin = apiBase.replace(/\/api\/?$/, '');
    const wsOrigin = origin.replace(/^http/, 'ws'); // http→ws, https→wss
    return `${wsOrigin}/ws/chat/`;
};

const handle = (evt) => {
    const store = useChatStore.getState();
    const myId = useAuthStore.getState().user?.id;
    switch (evt.type) {
        case 'message.new': {
            store.handleIncoming(evt.message, myId);
            // If this was a brand-new conversation, refresh the list for accurate metadata.
            const conv = useChatStore.getState().conversations.find((c) => c.id === evt.message.conversationId);
            if (conv && conv._needsRefresh) {
                messageService.listConversations().then(store.setConversations).catch(() => {});
            }
            break;
        }
        case 'message.read':
            store.setRead(evt.conversationId, evt.userId, evt.lastReadAt, myId);
            break;
        case 'typing':
            store.setTyping(evt.conversationId, evt.userId, evt.isTyping);
            break;
        case 'reaction.update':
            store.updateReactions(evt.conversationId, evt.messageId, evt.reactions);
            break;
        case 'presence':
            store.setPresence(evt.userId, evt.online);
            break;
        case 'notification.new':
            useNotificationStore.getState().addOne(evt.notification);
            break;
        default:
            break;
    }
};

const openSocket = (token) => {
    socket = new WebSocket(wsUrl(), ['plmun.jwt', token]);
    socket.onopen = () => { backoff = 1000; useChatStore.getState().setConnected(true); resyncNotifications(); };
    socket.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch { /* ignore */ } };
    socket.onclose = () => {
        useChatStore.getState().setConnected(false);
        if (shouldReconnect) scheduleReconnect();
    };
    socket.onerror = () => { try { socket.close(); } catch { /* ignore */ } };
};

const scheduleReconnect = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        const t = useAuthStore.getState().token;
        if (t && shouldReconnect) openSocket(t);
    }, backoff);
    backoff = Math.min(backoff * 2, 15000);
};

export const connectChat = () => {
    // Cancel any pending teardown — covers React StrictMode's mount→unmount→mount
    // and quick route bounces, so we don't close a socket that's still connecting.
    clearTimeout(disconnectTimer);
    const token = useAuthStore.getState().token;
    if (!token || (socket && socket.readyState <= WebSocket.OPEN)) return;
    shouldReconnect = true;
    openSocket(token);
};

export const disconnectChat = () => {
    // Defer the actual close. If we remount within the grace window (StrictMode,
    // fast navigation), connectChat() clears this and the live socket survives —
    // which avoids the "WebSocket is closed before the connection is established"
    // warning from tearing down a CONNECTING socket.
    clearTimeout(disconnectTimer);
    disconnectTimer = setTimeout(() => {
        shouldReconnect = false;
        clearTimeout(reconnectTimer);
        if (socket) { try { socket.close(); } catch { /* ignore */ } socket = null; }
        useChatStore.getState().reset();
    }, 300);
};

export const sendChat = (obj) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(obj));
        return true;
    }
    return false;
};
