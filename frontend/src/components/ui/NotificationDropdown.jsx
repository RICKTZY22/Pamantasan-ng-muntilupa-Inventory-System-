import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bell,
    Check,
    Checks as CheckCheck,
    Warning as AlertTriangle,
    ChatCircle as MessageCircle,
    Info,
    X,
    Trash as Trash2
} from '@phosphor-icons/react';
import useNotifications from '../../hooks/useNotifications';

// Keyed to the backend Notification.Type choices (COMMENT, STATUS_CHANGE,
// REMINDER, OVERDUE). SYSTEM is the fallback for anything unmapped.
const notificationIcons = {
    COMMENT: { icon: MessageCircle, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
    STATUS_CHANGE: { icon: Check, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
    REMINDER: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' },
    OVERDUE: { icon: X, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
    SYSTEM: { icon: Info, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700' },
};

const NotificationDropdown = () => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAll,
        fetchNotifications,
    } = useNotifications();

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = () => {
        const willOpen = !isOpen;
        setIsOpen(willOpen);
        if (willOpen) fetchNotifications();
    };

    const getNotificationRoute = (type) => {
        switch (type) {
            case 'REQUEST_PENDING':
            case 'REQUEST_APPROVED':
            case 'REQUEST_REJECTED':
            case 'STATUS_CHANGE':
            case 'COMMENT':
            case 'OVERDUE':
            case 'REMINDER':
                return '/requests';
            case 'LOW_STOCK':
            case 'INVENTORY_UPDATE':
                return '/inventory';
            default:
                return null;
        }
    };

    const handleNotificationClick = (notification) => {
        if (!notification.isRead) {
            markAsRead(notification.id);
        }
        setIsOpen(false);
        const route = getNotificationRoute(notification.type);
        if (route) navigate(route);
    };

    const getTimeAgo = (dateStr) => {
        if (!dateStr) return '';
        const diff = Date.now() - new Date(dateStr).getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Button */}
            <button
                onClick={handleToggle}
                className="relative p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                <Bell size={22} className="text-gray-600 dark:text-gray-300" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <h3 className="font-bold text-gray-900 dark:text-white">Notifications</h3>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1"
                                >
                                    <CheckCheck size={12} /> Read all
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
                                >
                                    <Trash2 size={12} /> Clear all
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Notifications List */}
                    <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="py-12 text-center">
                                <Bell size={32} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                                <p className="text-gray-500 dark:text-gray-400 text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.slice(0, 15).map((notification) => {
                                const iconConfig = notificationIcons[notification.type] || notificationIcons.SYSTEM;
                                const IconComponent = iconConfig.icon;

                                return (
                                    <div
                                        key={notification.id}
                                        className={`group flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors border-b border-gray-50 dark:border-gray-700/50 last:border-0 ${!notification.isRead ? 'bg-primary/5' : ''
                                            }`}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        {/* Icon */}
                                        <div className={`w-10 h-10 rounded-full ${iconConfig.bg} flex items-center justify-center flex-shrink-0`}>
                                            <IconComponent size={18} className={iconConfig.color} />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-medium'} text-gray-900 dark:text-gray-100 leading-snug`}>
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {getTimeAgo(notification.createdAt)}
                                            </p>
                                        </div>

                                        {/* Unread indicator */}
                                        {!notification.isRead && (
                                            <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />
                                        )}

                                        {/* Delete single */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteNotification(notification.id);
                                            }}
                                            className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex-shrink-0"
                                            title="Remove notification"
                                        >
                                            <X size={14} className="text-gray-400" />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationDropdown;
