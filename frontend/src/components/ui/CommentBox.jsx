import React, { useState, useRef, useEffect } from 'react';
import { PaperPlaneTilt as Send, ChatCircle as MessageCircle } from '@phosphor-icons/react';

/**
 * CommentBox — Chat-style messaging UI for request comments.
 *
 * Props:
 *   comments      – Array of comment objects from the API
 *                   Each has: { id, text, authorName, timestamp, author: { id, avatar, fullName, role } }
 *   currentUserId – The logged-in user's ID (used to align own messages right)
 *   onAddComment  – Callback(text: string) when the user sends a message
 *   loading       – Whether a comment is currently being submitted
 */
const CommentBox = ({ comments = [], onAddComment, currentUserId, loading = false }) => {
    const [newComment, setNewComment] = useState('');
    const scrollRef = useRef(null);

    // Auto-scroll to bottom when comments change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [comments.length]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!newComment.trim() || loading) return;
        onAddComment?.(newComment.trim());
        setNewComment('');
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

        // Same year → show Month Day, HH:MM
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
                ' ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleDateString();
    };

    /** Get initials from a name string, e.g. "Juan Dela Cruz" → "JD" */
    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    /** Pick a consistent color for a user based on their ID */
    const avatarColors = [
        'from-violet-500 to-purple-600',
        'from-blue-500 to-cyan-600',
        'from-emerald-500 to-teal-600',
        'from-amber-500 to-orange-600',
        'from-rose-500 to-pink-600',
        'from-indigo-500 to-blue-600',
    ];
    const getAvatarColor = (userId) => avatarColors[(userId || 0) % avatarColors.length];

    const renderAvatar = (comment) => {
        const authorId = comment.author?.id;
        const rawAvatar = comment.author?.avatar;
        const name = comment.authorName || comment.author?.fullName || 'User';

        // Resolve relative avatar URLs from Django (e.g. "/media/avatars/pic.jpg")
        const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';
        const avatar = rawAvatar && rawAvatar.startsWith('/') ? `${BACKEND_URL}${rawAvatar}` : rawAvatar;

        if (avatar) {
            return (
                <img
                    src={avatar}
                    alt={name}
                    className="w-8 h-8 rounded-full object-cover ring-2 ring-white dark:ring-gray-800 flex-shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
            );
        }

        return (
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(authorId)} flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-gray-800`}>
                <span className="text-white text-xs font-bold">{getInitials(name)}</span>
            </div>
        );
    };

    return (
        <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 mb-3">
                <MessageCircle size={18} />
                <span className="font-semibold text-sm">Comments ({comments.length})</span>
            </div>

            {/* Chat Area */}
            <div
                ref={scrollRef}
                className="max-h-64 min-h-[120px] overflow-y-auto space-y-1 pr-1 mb-3 scroll-smooth"
                style={{ scrollbarWidth: 'thin' }}
            >
                {comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
                        <MessageCircle size={32} className="mb-2 opacity-40" />
                        <p className="text-sm">No comments yet</p>
                        <p className="text-xs">Start the conversation below</p>
                    </div>
                ) : (
                    comments.map((comment, idx) => {
                        const isOwn = comment.author?.id === currentUserId;
                        const authorName = comment.authorName || comment.author?.fullName || 'User';
                        const authorRole = comment.author?.role;

                        // Show name header if different author than previous
                        const prevComment = idx > 0 ? comments[idx - 1] : null;
                        const showHeader = !prevComment || prevComment.author?.id !== comment.author?.id;

                        return (
                            <div key={comment.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
                                {/* Left avatar (others) */}
                                <div className={`flex items-end gap-2 max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                                    {/* Avatar — only show on first message in a group */}
                                    <div className="w-8 flex-shrink-0">
                                        {showHeader && renderAvatar(comment)}
                                    </div>

                                    {/* Bubble */}
                                    <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                        {/* Author name + role badge */}
                                        {showHeader && (
                                            <div className={`flex items-center gap-1.5 mb-0.5 px-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                                                    {isOwn ? 'You' : authorName}
                                                </span>
                                                {authorRole && authorRole !== 'STUDENT' && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${authorRole === 'ADMIN' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                                        authorRole === 'STAFF' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                                                            'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                        }`}>
                                                        {authorRole}
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* Message bubble */}
                                        <div
                                            className={`px-3.5 py-2 text-sm leading-relaxed break-words ${isOwn
                                                ? 'bg-primary text-white rounded-2xl rounded-br-md'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-md'
                                                }`}
                                        >
                                            {comment.text}
                                        </div>

                                        {/* Timestamp */}
                                        <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                                            {formatTime(comment.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <div className="flex-1 relative">
                    <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a message..."
                        rows={1}
                        className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent outline-none dark:text-white resize-none placeholder-gray-400"
                        style={{ minHeight: '40px', maxHeight: '100px' }}
                    />
                </div>
                <button
                    type="submit"
                    disabled={!newComment.trim() || loading}
                    className="w-10 h-10 flex items-center justify-center bg-primary text-white rounded-full hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 flex-shrink-0"
                >
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Send size={16} />
                    )}
                </button>
            </form>
        </div>
    );
};

export default CommentBox;
