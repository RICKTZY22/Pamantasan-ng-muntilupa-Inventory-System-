import React, { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    SquaresFour as LayoutDashboard,
    Package,
    FileText,
    ChartBar as BarChart3,
    GearSix as Settings,
    SignOut as LogOut,
    CaretLeft as ChevronLeft,
    List as Menu,
    Users,
    X
} from '@phosphor-icons/react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import useAuthStore from '../../store/authStore';
import plmunLogo from '../../assets/images/logo.png';
import { ROLES, hasMinRole } from '../../utils/roles';
import { requestService } from '../../services';
import { useEscapeKey, useFocusTrap, useBodyScrollLock, useIsMobile } from '../../hooks';

const MotionAside = motion.aside;
const MotionDiv = motion.div;

// navigation groups depende sa role ng user
const getNavGroups = (userRole) => {
    const groups = [
        {
            label: 'Main',
            items: [
                { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
                { icon: Package, label: hasMinRole(userRole, ROLES.STAFF) ? 'Inventory' : 'Items', path: '/inventory' },
                { icon: FileText, label: 'Requests', path: '/requests', badge: true },
            ]
        },
    ];

    // Analytics group (staff+)
    if (hasMinRole(userRole, ROLES.STAFF)) {
        groups.push({
            label: 'Analytics',
            items: [
                { icon: BarChart3, label: 'Reports', path: '/reports' },
            ]
        });
    }

    // Management group
    const mgmtItems = [];
    if (hasMinRole(userRole, ROLES.ADMIN)) {
        mgmtItems.push({ icon: Users, label: 'Users', path: '/users' });
    }
    mgmtItems.push({ icon: Settings, label: 'Settings', path: '/settings' });

    groups.push({ label: 'Management', items: mgmtItems });

    return groups;
};

const Sidebar = ({ collapsed, setCollapsed, mobileOpen, setMobileOpen }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout } = useAuthStore();
    const [pendingCount, setPendingCount] = useState(0);
    const isMobile = useIsMobile();
    const reduce = useReducedMotion();
    // Only trap focus / lock scroll / bind Escape while the mobile drawer is open.
    const trapActive = mobileOpen && isMobile;
    useEscapeKey(() => setMobileOpen(false), trapActive);
    const drawerRef = useFocusTrap(trapActive);
    useBodyScrollLock(trapActive);

    useEffect(() => {
        setMobileOpen?.(false);
    }, [location.pathname, setMobileOpen]);

    // pending count para sa badge ng Requests link
    // TODO: ang daming api call nito every minute, gawing shared state na lang
    const fetchPendingCount = useCallback(async () => {
        try {
            const data = await requestService.getAll();
            const items = Array.isArray(data) ? data : data.results || [];
            const isStaffPlus = hasMinRole(user?.role, ROLES.STAFF);
            const pending = items.filter(r =>
                r.status === 'PENDING' && (isStaffPlus || r.requestedById === user?.id)
            ).length;
            setPendingCount(pending);
        } catch { /* non-critical */ }
    }, [user?.role, user?.id]);

    useEffect(() => {
        fetchPendingCount();
        const interval = setInterval(fetchPendingCount, 60000);
        return () => clearInterval(interval);
    }, [fetchPendingCount]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navGroups = getNavGroups(user?.role);

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {trapActive && (
                    <MotionDiv
                        className="fixed inset-0 bg-black/40 z-40 md:hidden backdrop-blur-sm"
                        onClick={() => setMobileOpen(false)}
                        aria-hidden="true"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reduce ? 0 : 0.2 }}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <MotionAside
                ref={drawerRef}
                id="mobile-sidebar"
                role="navigation"
                aria-label="Main navigation"
                initial={false}
                animate={{ x: isMobile ? (mobileOpen ? 0 : '-100%') : 0 }}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 34 }}
                className={`
                fixed left-0 top-0 h-screen z-50
                bg-white dark:bg-gray-900
                border-r border-gray-200 dark:border-gray-800
                flex flex-col
                ${collapsed ? 'w-[68px]' : 'w-60'}
            `}>
                {/* Logo Header */}
                <div className="h-14 flex items-center justify-between px-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                            <img src={plmunLogo} alt="PLMun" className="w-7 h-7 object-contain" />
                        </div>
                        {!collapsed && (
                            <div className="min-w-0">
                                <h1 className="font-bold text-sm text-gray-900 dark:text-white leading-tight truncate">PLMun Nexus</h1>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Inventory</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            if (window.innerWidth < 768) {
                                setMobileOpen(false);
                            } else {
                                setCollapsed(!collapsed);
                            }
                        }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        {mobileOpen && window.innerWidth < 768 ? (
                            <X size={18} />
                        ) : collapsed ? (
                            <Menu size={18} />
                        ) : (
                            <ChevronLeft size={18} />
                        )}
                    </button>
                </div>

                {/* Navigation Groups */}
                <nav className="flex-1 py-2 px-2 overflow-y-auto scrollbar-hide">
                    {navGroups.map((group, gi) => (
                        <div key={group.label} className={gi > 0 ? 'mt-4' : ''}>
                            {/* Section Label */}
                            {!collapsed && (
                                <span className="block px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                    {group.label}
                                </span>
                            )}
                            {collapsed && gi > 0 && (
                                <div className="mx-3 mb-2 border-t border-gray-100 dark:border-gray-800" />
                            )}

                            {/* Nav Items */}
                            <div className="space-y-0.5">
                                {group.items.map((item) => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        className={({ isActive }) => `
                                            flex items-center gap-2.5 px-3 py-2 rounded-lg
                                            transition-all duration-150 ease-out
                                            group relative
                                            ${isActive
                                                ? 'bg-accent/10 text-accent dark:bg-accent/15 dark:text-accent-light font-semibold'
                                                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200'
                                            }
                                        `}
                                    >
                                        {({ isActive }) => (
                                            <>
                                                <item.icon size={18} className={`flex-shrink-0 ${isActive ? 'text-accent dark:text-accent-light' : ''}`} />

                                                {!collapsed && (
                                                    <span className="text-[13px] truncate">{item.label}</span>
                                                )}

                                                {/* Pending badge */}
                                                {item.badge && pendingCount > 0 && (
                                                    <span className={`
                                                        ${collapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto'}
                                                        min-w-[18px] h-[18px] px-1
                                                        flex items-center justify-center
                                                        text-[10px] font-bold rounded-full
                                                        bg-red-500 text-white
                                                    `}>
                                                        {pendingCount > 99 ? '99+' : pendingCount}
                                                    </span>
                                                )}

                                                {/* Collapsed tooltip */}
                                                {collapsed && (
                                                    <div className="
                                                        absolute left-full ml-2 px-2.5 py-1.5
                                                        bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-md
                                                        opacity-0 invisible group-hover:opacity-100 group-hover:visible
                                                        transition-all duration-150
                                                        whitespace-nowrap z-50 shadow-lg
                                                        hidden md:block
                                                    ">
                                                        {item.label}
                                                        {item.badge && pendingCount > 0 && (
                                                            <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                                                {pendingCount}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User Section — pinned at bottom */}
                <div className="p-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <div className={`flex items-center gap-2 p-2 rounded-lg ${collapsed ? 'justify-center' : ''}`}>
                        {user?.avatar ? (
                            <img
                                src={user.avatar}
                                alt="Profile"
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                            />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-accent/10 dark:bg-accent/20 flex items-center justify-center text-accent font-semibold text-sm flex-shrink-0">
                                {user?.fullName?.charAt(0) || 'U'}
                            </div>
                        )}
                        {!collapsed && (
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs text-gray-900 dark:text-gray-100 truncate">{user?.fullName || 'User'}</p>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{user?.role || 'Student'}</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={handleLogout}
                        className={`
                            w-full mt-1 flex items-center gap-2
                            px-3 py-2.5 rounded-lg
                            text-red-500 bg-red-50 dark:bg-red-500/10
                            hover:bg-red-100 dark:hover:bg-red-500/20
                            transition-all duration-150
                            ${collapsed ? 'justify-center' : ''}
                        `}
                    >
                        <LogOut size={18} />
                        {!collapsed && <span className="text-sm font-semibold">Log Out</span>}
                    </button>
                </div>
            </MotionAside>
        </>
    );
};

export default Sidebar;
