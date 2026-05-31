import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    MagnifyingGlass as Search, ArrowLeft, PaperPlaneTilt as Send, Plus,
    Check, Checks, ChatCircle, Package, CircleNotch, X, Image as ImageIcon, Smiley,
    AddressBook, Archive, Trash,
} from '@phosphor-icons/react';
import { Avatar, Input, Button, Modal } from '../components/ui';
import { useIsMobile } from '../hooks';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import messageService from '../services/messageService';
import inventoryService from '../services/inventoryService';
import { sendChat } from '../services/chatSocket';
import { getRoleMeta } from '../components/users/roleMeta';
import { resolveImageUrl } from '../utils/imageUtils';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const relTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const clockTime = (ts) => (ts ? new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

const formatAssistantBody = (body = '') => body
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*(?:\*|\u2022)\s+/gm, '- ')
    .replace(/\s+(?:\*|\u2022)\s+/g, '\n- ')
    .replace(/\s+(Your recent requests include:|Recent visible requests:|Visible request totals:)/gi, '\n\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// Small inventory-item reference card rendered inside a bubble.
const ItemRefCard = ({ item }) => (
    <div className="mt-1.5 flex items-center gap-2.5 p-2 rounded-lg bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/10 max-w-[240px]">
        <span className="flex items-center justify-center w-9 h-9 rounded-md bg-white/70 dark:bg-gray-900/40 flex-shrink-0">
            <Package size={18} weight="duotone" />
        </span>
        <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">{item.name}</span>
            <span className="block text-[11px] opacity-80">{item.brand ? `${item.brand} · ` : ''}{item.category} · {item.quantity} in stock</span>
        </span>
    </div>
);

const Messages = () => {
    const isMobile = useIsMobile();
    const location = useLocation();
    const navigate = useNavigate();
    const me = useAuthStore((s) => s.user);
    const { conversations, messages, online, typing, activeId, setConversations, setActive, setMessages, prependMessages, upsertConversation } = useChatStore();

    const [loadingList, setLoadingList] = useState(true);
    const [tab, setTab] = useState('general'); // general | archive
    const [search, setSearch] = useState('');
    const [loadingThread, setLoadingThread] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [draft, setDraft] = useState('');
    const [newOpen, setNewOpen] = useState(false);
    const [contacts, setContacts] = useState(null);
    const [referItem, setReferItem] = useState(null);   // pending inventory item to attach
    const [pendingAssistantItem, setPendingAssistantItem] = useState(null); // item to ask the assistant about, once its thread loads
    const [itemPickerOpen, setItemPickerOpen] = useState(false);
    const [items, setItems] = useState(null);
    const [itemSearch, setItemSearch] = useState('');
    const [reactingId, setReactingId] = useState(null);  // message id whose emoji picker is open
    const [assistantSending, setAssistantSending] = useState(false);
    const [assistantError, setAssistantError] = useState('');
    const scrollRef = useRef(null);
    const fileInputRef = useRef(null);
    const longPressRef = useRef(null);
    const typingTimerRef = useRef(null);
    const typingActiveRef = useRef(false);
    const handledAssistantItemRef = useRef(null);

    // Bootstrap the conversation list (socket is connected app-wide in the layout).
    useEffect(() => {
        let alive = true;
        Promise.all([
            messageService.getAssistantConversation(),
            messageService.listConversations(),
        ])
            .then(([assistantConv, list]) => {
                if (!alive) return;
                const rest = list.filter((c) => c.id !== assistantConv.id);
                setConversations([assistantConv, ...rest]);
            })
            .catch(() => {})
            .finally(() => { if (alive) setLoadingList(false); });
        return () => { alive = false; };
    }, [setConversations]);

    // Referral from the Inventory page. Two entry points:
    //  - referItem        → open the contact picker to send it to staff/admin.
    //  - askAssistantItem → attach it to the PLMun Assistant thread to ask about it.
    useEffect(() => {
        const refer = location.state?.referItem;
        const askItem = location.state?.askAssistantItem;
        if (refer) {
            setReferItem(refer);
            setNewOpen(true);
            messageService.getContacts().then(setContacts).catch(() => setContacts([]));
        } else if (askItem) {
            setPendingAssistantItem(askItem);
        }
        if (refer || askItem) navigate(location.pathname, { replace: true, state: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (tab !== 'contacts' || contacts !== null) return;
        messageService.getContacts().then(setContacts).catch(() => setContacts([]));
    }, [tab, contacts]);

    const active = conversations.find((c) => c.id === activeId);
    const thread = messages[activeId] || [];
    const activeIsAssistant = !!active?.isAssistant;

    // Auto-scroll thread to bottom on new messages.
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [thread.length, activeId]);

    // ── Typing indicator (emit side) ──
    // Broadcasts a debounced typing state to the other party over the socket.
    // De-duped so we only send on transitions, not every keystroke. The
    // assistant thread has no live recipient, so it's skipped.
    const setTypingState = useCallback((isTyping) => {
        if (!activeId || activeIsAssistant) return;
        if (isTyping === typingActiveRef.current) return;
        typingActiveRef.current = isTyping;
        sendChat({ type: 'typing', conversationId: activeId, isTyping });
    }, [activeId, activeIsAssistant]);

    const handleDraftChange = (e) => {
        setDraft(e.target.value);
        if (assistantError) setAssistantError('');
        if (activeIsAssistant) return;
        setTypingState(true);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTypingState(false), 2000);
    };

    // Reset typing state when switching threads (and stop on unmount) so a stale
    // "typing…" from one conversation never lingers in another.
    useEffect(() => {
        typingActiveRef.current = false;
        clearTimeout(typingTimerRef.current);
        return () => clearTimeout(typingTimerRef.current);
    }, [activeId]);

    const openConversation = useCallback(async (id) => {
        setActive(id);
        setAssistantError('');
        setLoadingThread(true);
        try {
            const data = await messageService.getMessages(id);
            setMessages(id, data.results || []);
            setHasMore(!!data.hasMore);
            messageService.markRead(id).catch(() => {}); // persists + broadcasts read receipt
        } finally {
            setLoadingThread(false);
        }
    }, [setActive, setMessages]);

    // Once the assistant thread exists in the list, open it and attach the
    // pending item so the user lands ready to ask about it.
    useEffect(() => {
        if (!pendingAssistantItem || !conversations.length) return;
        // openConversation() below calls setActive(), a zustand update that
        // synchronously re-renders and re-fires this effect BEFORE React flushes
        // setPendingAssistantItem(null) — so a state-only guard loops forever.
        // A ref flips synchronously, blocking re-entry for this same item.
        if (handledAssistantItemRef.current === pendingAssistantItem) return;
        const assistantConv = conversations.find((c) => c.isAssistant);
        if (!assistantConv) return;
        handledAssistantItemRef.current = pendingAssistantItem;
        openConversation(assistantConv.id);
        setReferItem(pendingAssistantItem);
        setPendingAssistantItem(null);
    }, [pendingAssistantItem, conversations, openConversation]);

    const loadEarlier = async () => {
        if (!activeId || !thread.length) return;
        const data = await messageService.getMessages(activeId, thread[0].id);
        prependMessages(activeId, data.results || []);
        setHasMore(!!data.hasMore);
    };

    const handleSend = async () => {
        const body = draft.trim();
        if ((!body && !referItem) || !activeId) return;
        if (activeIsAssistant) {
            if (!body) return; // the assistant needs a typed question
            const attachedItem = referItem;
            setDraft('');
            setReferItem(null);
            setAssistantError('');
            setAssistantSending(true);
            try {
                const res = await messageService.sendAssistantMessage(body, attachedItem?.id);
                setMessages(activeId, [...thread, res.userMessage, res.assistantMessage]);
                upsertConversation(res.conversation);
            } catch (err) {
                setDraft(body);
                setReferItem(attachedItem);
                setAssistantError(err.response?.data?.detail || 'Assistant is unavailable right now.');
            } finally {
                setAssistantSending(false);
            }
            return;
        }
        const itemId = referItem?.id;
        setDraft('');
        setReferItem(null);
        // Sending implies we're no longer typing — clear it so the recipient's
        // indicator doesn't stick (an incoming message doesn't reset it).
        clearTimeout(typingTimerRef.current);
        setTypingState(false);
        const sent = sendChat({ type: 'message.send', conversationId: activeId, body, itemId });
        if (!sent) {
            // socket down → REST fallback (still persists + broadcasts)
            try { await messageService.sendMessage(activeId, body, itemId); } catch { setDraft(body); setReferItem(referItem); }
        }
    };

    const handleAttach = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !activeId) return;
        try { await messageService.sendAttachment(activeId, file, draft.trim()); setDraft(''); } catch { /* surfaced by reload */ }
    };

    const handleReact = (messageId, emoji) => {
        setReactingId(null);
        if (!activeId) return;
        const sent = sendChat({ type: 'reaction.toggle', conversationId: activeId, messageId, emoji });
        if (!sent) messageService.react(activeId, messageId, emoji).catch(() => {});
    };

    // Mobile: press-and-hold a bubble (~450ms) to open its emoji picker.
    const startLongPress = (messageId) => {
        clearTimeout(longPressRef.current);
        longPressRef.current = setTimeout(() => setReactingId(messageId), 450);
    };
    const cancelLongPress = () => clearTimeout(longPressRef.current);

    const openItemPicker = async () => {
        setItemPickerOpen(true);
        if (!items) {
            try { setItems(await inventoryService.getAll()); } catch { setItems([]); }
        }
    };
    const pickItem = (it) => { setReferItem(it); setItemPickerOpen(false); };

    const filteredItems = useMemo(() => {
        if (!items) return [];
        const q = itemSearch.trim().toLowerCase();
        return q ? items.filter((it) => (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q)) : items;
    }, [items, itemSearch]);

    const filteredContacts = useMemo(() => {
        if (!contacts) return [];
        const q = search.trim().toLowerCase();
        return q
            ? contacts.filter((u) => (u.name || '').toLowerCase().includes(q) || (getRoleMeta(u.role)?.label || '').toLowerCase().includes(q))
            : contacts;
    }, [contacts, search]);

    const openNew = async () => {
        setNewOpen(true);
        if (!contacts) {
            try { setContacts(await messageService.getContacts()); } catch { setContacts([]); }
        }
    };
    const startWith = async (userId) => {
        try {
            const conv = await messageService.startConversation(userId);
            upsertConversation(conv);
            setNewOpen(false);
            openConversation(conv.id);
        } catch { /* role gate / error */ }
    };

    const archiveConversation = async (conversation, archived) => {
        if (!conversation || conversation.isAssistant) return;
        try {
            await messageService.archive(conversation.id, archived);
            setConversations(conversations.map((c) => (c.id === conversation.id ? { ...c, isArchived: archived } : c)));
            if (activeId === conversation.id) setActive(null);
        } catch { /* keep current state */ }
    };

    const deleteConversation = async (conversation) => {
        if (!conversation) return;
        try {
            await messageService.deleteConversation(conversation.id);
            if (conversation.isAssistant) {
                setMessages(conversation.id, []);
                setConversations(conversations.map((c) => (
                    c.id === conversation.id
                        ? { ...c, lastMessage: null, unreadCount: 0, updatedAt: new Date().toISOString() }
                        : c
                )));
                setAssistantError('');
                return;
            }
            setConversations(conversations.filter((c) => c.id !== conversation.id));
            setMessages(conversation.id, []);
            if (activeId === conversation.id) setActive(null);
        } catch { /* keep current state */ }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return conversations
            .filter((c) => (tab === 'archive' ? c.isArchived : !c.isArchived))
            .filter((c) => !q || (c.other?.name || '').toLowerCase().includes(q) || (c.lastMessage?.body || '').toLowerCase().includes(q));
    }, [conversations, tab, search]);

    const generalCount = conversations.filter((c) => !c.isArchived).length;
    const archiveCount = conversations.filter((c) => c.isArchived).length;

    const showList = !isMobile || !activeId;
    const showThread = !isMobile || !!activeId;

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Messages</h1>

            <div className="flex h-[calc(100vh-12rem)] min-h-[440px] rounded-2xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 overflow-hidden shadow-card">
                {/* ── Conversation list ── */}
                {showList && (
                    <aside className="flex flex-col w-full md:w-80 md:flex-shrink-0 border-r border-gray-100 dark:border-gray-700/60">
                        <div className="p-3 space-y-3 border-b border-gray-100 dark:border-gray-700/60">
                            <div className="flex items-center gap-2">
                                <div className="flex-1 flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5 text-sm">
                                    <button onClick={() => setTab('general')} className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${tab === 'general' ? 'bg-accent text-white' : 'text-gray-600 dark:text-gray-300'}`}>General {generalCount > 0 && <span className="opacity-70">{generalCount}</span>}</button>
                                    <button onClick={() => setTab('archive')} className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${tab === 'archive' ? 'bg-accent text-white' : 'text-gray-600 dark:text-gray-300'}`}>Archive {archiveCount > 0 && <span className="opacity-70">{archiveCount}</span>}</button>
                                    <button onClick={() => setTab('contacts')} className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${tab === 'contacts' ? 'bg-accent text-white' : 'text-gray-600 dark:text-gray-300'}`}>Contacts</button>
                                </div>
                                <Button size="sm" icon={Plus} onClick={openNew} aria-label="New message">New</Button>
                            </div>
                            <Input icon={Search} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {loadingList ? (
                                <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
                            ) : tab === 'contacts' ? (
                                contacts === null ? (
                                    <div className="p-6 text-center text-sm text-gray-400">Loading contacts...</div>
                                ) : filteredContacts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-gray-400 dark:text-gray-500">
                                        <AddressBook size={32} weight="duotone" className="mb-2" />
                                        <p className="text-sm font-medium">No contacts</p>
                                    </div>
                                ) : filteredContacts.map((u) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => startWith(u.id)}
                                        className="w-full flex items-center gap-3 px-3 py-3 text-left border-b border-gray-50 dark:border-gray-800/60 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                    >
                                        <div className="relative flex-shrink-0">
                                            <Avatar src={u.avatar} name={u.name} size={44} />
                                            {(online[u.id] || u.online) && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <span className="block text-sm font-semibold text-gray-900 dark:text-white truncate">{u.name}</span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">{getRoleMeta(u.role)?.label || u.role}</span>
                                        </div>
                                    </button>
                                ))
                            ) : filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-gray-400 dark:text-gray-500">
                                    <ChatCircle size={32} weight="duotone" className="mb-2" />
                                    <p className="text-sm font-medium">No conversations</p>
                                    <p className="text-xs mt-1">Start one with the “New” button.</p>
                                </div>
                            ) : filtered.map((c) => {
                                const isAssistant = c.isAssistant;
                                const lastMine = c.lastMessage?.senderId === me?.id;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => { setReferItem(null); openConversation(c.id); }}
                                        className={`w-full flex items-center gap-3 px-3 py-3 text-left border-b border-gray-50 dark:border-gray-800/60 transition-colors ${activeId === c.id ? 'bg-accent/5 dark:bg-accent/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                                    >
                                        <div className="relative flex-shrink-0">
                                            <Avatar src={c.other?.avatar} name={c.other?.name} size={44} isAssistant={isAssistant} />
                                            {!isAssistant && online[c.other?.id] && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.other?.name || 'Unknown'}</span>
                                                <span className="text-[11px] text-gray-400 flex-shrink-0">{relTime(c.lastMessage?.createdAt || c.updatedAt)}</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                                {lastMine && <span className="text-gray-400">You:</span>}
                                                <span className="truncate flex-1">{c.lastMessage?.hasItem && !c.lastMessage?.body ? '📦 Referred an item' : (c.lastMessage?.body || (isAssistant ? 'Ask app and inventory questions' : 'No messages yet'))}</span>
                                                {c.unreadCount > 0 && <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold rounded-full bg-accent text-white flex-shrink-0">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                )}

                {/* ── Thread ── */}
                {showThread && (
                    <section className="flex-1 flex flex-col min-w-0">
                        {!active ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 dark:text-gray-500 px-6">
                                <ChatCircle size={40} weight="duotone" className="mb-3" />
                                <p className="text-sm font-medium">Select a conversation</p>
                            </div>
                        ) : (
                            <>
                                {/* header */}
                                <div className="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-gray-700/60">
                                    {isMobile && (
                                        <button type="button" onClick={() => setActive(null)} aria-label="Back" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/60"><ArrowLeft size={18} /></button>
                                    )}
                                    <Avatar src={active.other?.avatar} name={active.other?.name} size={38} isAssistant={activeIsAssistant} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{active.other?.name || 'Unknown'}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {typing[active.id] && typing[active.id] === active.other?.id
                                                ? <span className="text-accent">typing…</span>
                                                : (online[active.other?.id] ? <span className="text-emerald-500">● Online</span> : (getRoleMeta(active.other?.role)?.label || ''))}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {!activeIsAssistant && (
                                            <button type="button" onClick={() => archiveConversation(active, !active.isArchived)} aria-label={active.isArchived ? 'Unarchive conversation' : 'Archive conversation'} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-accent hover:bg-gray-100 dark:hover:bg-gray-700/60 transition">
                                                <Archive size={18} />
                                            </button>
                                        )}
                                        <button type="button" onClick={() => deleteConversation(active)} aria-label={activeIsAssistant ? 'Clear assistant history' : 'Delete conversation'} className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                                            <Trash size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* messages */}
                                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
                                    {hasMore && (
                                        <div className="text-center pb-2">
                                            <button onClick={loadEarlier} className="text-xs text-[var(--accent)] hover:underline">Load earlier messages</button>
                                        </div>
                                    )}
                                    {loadingThread && thread.length === 0 ? (
                                        <div className="flex items-center justify-center py-10 text-gray-400"><CircleNotch size={22} className="animate-spin" /></div>
                                    ) : thread.map((m, i) => {
                                        const mine = m.senderId === me?.id;
                                        const prev = thread[i - 1];
                                        const showAvatar = !mine && (!prev || prev.senderId !== m.senderId);
                                        const read = mine && active.otherReadAt && new Date(active.otherReadAt) >= new Date(m.createdAt);
                                        const attachUrl = m.attachment ? resolveImageUrl(m.attachment) : null;
                                        const bodyText = m.sender?.isAssistant ? formatAssistantBody(m.body) : m.body;
                                        return (
                                            <div key={m.id} className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                                                <div className="w-7 flex-shrink-0">{showAvatar && <Avatar src={m.sender?.avatar} name={m.sender?.name} size={28} isAssistant={m.sender?.isAssistant} />}</div>
                                                <div className={`max-w-[72%] flex flex-col relative ${mine ? 'items-end' : 'items-start'}`}>
                                                    {/* click-away backdrop while this message's picker is open */}
                                                    {!activeIsAssistant && reactingId === m.id && (
                                                        <div className="fixed inset-0 z-20" onClick={() => setReactingId(null)} aria-hidden="true" />
                                                    )}
                                                    {/* emoji picker — opened by the trigger button (desktop) or long-press (mobile) */}
                                                    {!activeIsAssistant && reactingId === m.id && (
                                                        <div className={`absolute -top-10 ${mine ? 'right-0' : 'left-0'} flex items-center gap-1 px-2 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg z-30`}>
                                                            {REACTIONS.map((em) => (
                                                                <button key={em} type="button" onClick={() => handleReact(m.id, em)} className="text-xl leading-none hover:scale-125 active:scale-110 transition-transform" aria-label={`React ${em}`}>{em}</button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1">
                                                        {!activeIsAssistant && mine && (
                                                            <button type="button" onClick={() => setReactingId(reactingId === m.id ? null : m.id)} aria-label="Add reaction" className="opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity p-1 text-gray-400 hover:text-accent shrink-0">
                                                                <Smiley size={18} />
                                                            </button>
                                                        )}
                                                        <div
                                                            onTouchStart={() => startLongPress(m.id)}
                                                            onTouchEnd={cancelLongPress}
                                                            onTouchMove={cancelLongPress}
                                                            onContextMenu={(e) => { if (isMobile) e.preventDefault(); }}
                                                            className={`px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-2xl select-none md:select-text ${mine ? 'bg-accent text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-md'}`}
                                                        >
                                                            {attachUrl && (
                                                                <img src={attachUrl} alt="attachment" onClick={() => { if (/^https?:\/\//i.test(attachUrl)) window.open(attachUrl, '_blank', 'noopener'); }} className={`rounded-lg max-w-[220px] max-h-[240px] object-cover cursor-pointer ${m.body || m.item ? 'mb-1.5' : ''}`} />
                                                            )}
                                                            {bodyText}
                                                            {m.item && <ItemRefCard item={m.item} />}
                                                        </div>
                                                        {!activeIsAssistant && !mine && (
                                                            <button type="button" onClick={() => setReactingId(reactingId === m.id ? null : m.id)} aria-label="Add reaction" className="opacity-0 pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto transition-opacity p-1 text-gray-400 hover:text-accent shrink-0">
                                                                <Smiley size={18} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {!activeIsAssistant && m.reactions?.length > 0 && (
                                                        <div className={`flex flex-wrap gap-1 mt-1 ${mine ? 'justify-end' : ''}`}>
                                                            {m.reactions.map((r) => {
                                                                const mineR = r.userIds?.includes(me?.id);
                                                                return (
                                                                    <button key={r.emoji} type="button" onClick={() => handleReact(m.id, r.emoji)} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${mineR ? 'bg-accent/15 border-accent/40 text-accent' : 'bg-gray-100 dark:bg-gray-700 border-transparent text-gray-600 dark:text-gray-300'}`}>
                                                                        <span>{r.emoji}</span><span className="tabular-nums">{r.count}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <span className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5 px-1">
                                                        {clockTime(m.createdAt)}
                                                        {mine && (read ? <Checks size={13} className="text-accent" /> : <Check size={13} />)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {activeIsAssistant && assistantSending && (
                                        <div className="flex items-end gap-2 justify-start">
                                            <div className="w-7 flex-shrink-0"><Avatar isAssistant size={28} /></div>
                                            <div className="px-3.5 py-2 text-sm rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-200 inline-flex items-center gap-2">
                                                <CircleNotch size={16} className="animate-spin" />
                                                Assistant is thinking...
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* composer */}
                                <div className="border-t border-gray-100 dark:border-gray-700/60">
                                    {activeIsAssistant && assistantError && (
                                        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 text-sm">
                                            {assistantError}
                                        </div>
                                    )}
                                    {referItem && (
                                        <div className="px-3 pt-2">
                                            <span className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium">
                                                <Package size={14} weight="duotone" /> Referring: {referItem.name}
                                                <button type="button" onClick={() => setReferItem(null)} className="hover:opacity-70" aria-label="Remove referred item"><X size={13} weight="bold" /></button>
                                            </span>
                                        </div>
                                    )}
                                    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-end gap-2 p-3">
                                        {!activeIsAssistant && (
                                            <>
                                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAttach} />
                                                <button type="button" onClick={() => fileInputRef.current?.click()} aria-label="Attach an image" className="w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:text-accent hover:bg-gray-100 dark:hover:bg-gray-700/60 transition flex-shrink-0">
                                                    <ImageIcon size={20} />
                                                </button>
                                            </>
                                        )}
                                        {/* Refer an inventory item — works for both human chats (send to staff)
                                            and the assistant thread (ask about the item). */}
                                        <button type="button" onClick={openItemPicker} aria-label="Refer an inventory item" className="w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:text-accent hover:bg-gray-100 dark:hover:bg-gray-700/60 transition flex-shrink-0">
                                            <Package size={20} />
                                        </button>
                                        <textarea
                                            value={draft}
                                            onChange={handleDraftChange}
                                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !(activeIsAssistant && assistantSending)) { e.preventDefault(); handleSend(); } }}
                                            placeholder={activeIsAssistant ? 'Ask the assistant...' : 'Type a message…'}
                                            rows={1}
                                            disabled={activeIsAssistant && assistantSending}
                                            className="flex-1 px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-accent/40 resize-none dark:text-white"
                                            style={{ minHeight: 42, maxHeight: 120 }}
                                        />
                                        <button type="submit" disabled={(activeIsAssistant && assistantSending) || (!draft.trim() && !referItem)} className="w-10 h-10 flex items-center justify-center bg-accent text-white rounded-full hover:bg-accent/90 transition disabled:opacity-40 flex-shrink-0">
                                            {activeIsAssistant && assistantSending ? <CircleNotch size={16} className="animate-spin" /> : <Send size={16} />}
                                        </button>
                                    </form>
                                </div>
                            </>
                        )}
                    </section>
                )}
            </div>

            {/* New message picker */}
            <Modal isOpen={newOpen} onClose={() => setNewOpen(false)} title="New message">
                {referItem && (
                    <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/10 text-accent text-sm">
                        <Package size={16} weight="duotone" />
                        <span className="min-w-0 flex-1">Referring <span className="font-semibold">{referItem.name}</span> — choose who to send it to.</span>
                    </div>
                )}
                <div className="space-y-1 max-h-[55vh] overflow-y-auto">
                    {contacts === null ? (
                        <div className="py-8 text-center text-sm text-gray-400"><CircleNotch size={22} className="animate-spin mx-auto" /></div>
                    ) : contacts.length === 0 ? (
                        <p className="py-8 text-center text-sm text-gray-500">No one available to message.</p>
                    ) : contacts.map((u) => (
                        <button key={u.id} type="button" onClick={() => startWith(u.id)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors">
                            <Avatar src={u.avatar} name={u.name} size={40} />
                            <div className="min-w-0">
                                <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{u.name}</span>
                                <span className="block text-xs text-gray-500 dark:text-gray-400">{getRoleMeta(u.role)?.label}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </Modal>

            {/* Refer an inventory item */}
            <Modal isOpen={itemPickerOpen} onClose={() => setItemPickerOpen(false)} title="Refer an item">
                <div className="space-y-3">
                    <Input icon={Search} placeholder="Search inventory…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                    <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                        {items === null ? (
                            <div className="py-8 text-center text-sm text-gray-400"><CircleNotch size={22} className="animate-spin mx-auto" /></div>
                        ) : filteredItems.length === 0 ? (
                            <p className="py-8 text-center text-sm text-gray-500">No items found.</p>
                        ) : filteredItems.map((it) => (
                            <button key={it.id} type="button" onClick={() => pickItem(it)} className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left transition-colors">
                                <span className="flex items-center justify-center w-9 h-9 rounded-md bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 flex-shrink-0">
                                    <Package size={18} weight="duotone" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-gray-900 dark:text-white truncate">{it.name}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{it.category} · {it.quantity} in stock</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Messages;
