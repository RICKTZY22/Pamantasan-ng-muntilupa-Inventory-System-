import api from './api';

// REST for bootstrap/history; live delivery is over the WebSocket (chatSocket).
const messageService = {
    listConversations: async () => (await api.get('/messaging/conversations/')).data,
    startConversation: async (userId) => (await api.post('/messaging/conversations/', { userId })).data,
    getMessages: async (id, before) => (await api.get(`/messaging/conversations/${id}/messages/`, { params: before ? { before } : {} })).data,
    sendMessage: async (id, body, itemId) => (await api.post(`/messaging/conversations/${id}/messages/`, { body, itemId })).data,
    sendAttachment: async (id, file, body = '') => {
        const fd = new FormData();
        if (body) fd.append('body', body);
        fd.append('attachment', file);
        return (await api.post(`/messaging/conversations/${id}/messages/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
    },
    react: async (id, messageId, emoji) => (await api.post(`/messaging/conversations/${id}/react/`, { messageId, emoji })).data,
    markRead: async (id) => (await api.post(`/messaging/conversations/${id}/read/`)).data,
    archive: async (id, archived) => (await api.post(`/messaging/conversations/${id}/archive/`, { archived })).data,
    deleteConversation: async (id) => (await api.post(`/messaging/conversations/${id}/delete/`)).data,
    getContacts: async () => (await api.get('/messaging/conversations/contacts/')).data,
    getAssistantConversation: async () => (await api.get('/messaging/assistant/conversation/')).data,
    sendAssistantMessage: async (body, itemId) => (await api.post('/messaging/assistant/messages/', { body, itemId })).data,
};

export default messageService;
