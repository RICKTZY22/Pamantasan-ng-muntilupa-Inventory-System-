import { useEffect, useState } from 'react';
import { Link, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { List as Menu, Warning as AlertTriangle } from '@phosphor-icons/react';
import { Sidebar, BottomNav, MaintenanceOverlay, AccountFlagOverlay } from '../components/layout';
import { Dashboard, Inventory, Requests, Messages, Reports, Login, Register, Settings, Users, AuditLogs, AccountDeactivated } from '../pages';
import { NotificationDropdown, AnimatedBackground } from '../components/ui';
import { useIsMobile, useMaintenanceWindow } from '../hooks';
import useAuthStore from '../store/authStore';
import useChatStore from '../store/chatStore';
import messageService from '../services/messageService';
import { connectChat, disconnectChat } from '../services/chatSocket';
import { RoleGuard } from '../components/auth';
import { ROLES } from '../utils/roles';

const PAGE_TITLES = {
    '/dashboard': 'Dashboard',
    '/inventory': 'Inventory',
    '/requests': 'Requests',
    '/messages': 'Messages',
    '/reports': 'Reports',
    '/settings': 'Settings',
    '/users': 'User Management',
    '/audit-logs': 'Audit Logs',
};

const DashboardGreeting = ({ user }) => (
    <>
        <span className="text-sm text-gray-600 dark:text-gray-300 hidden sm:inline">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, <span className="font-semibold text-gray-900 dark:text-white">{user?.fullName?.split(' ')[0] || 'User'}</span>!
        </span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white sm:hidden">
            {user?.fullName?.split(' ')[0] || 'Hi'}
        </span>
    </>
);

const PageHeaderTitle = ({ isDashboard, title, user }) => (
    isDashboard ? (
        <DashboardGreeting user={user} />
    ) : (
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {title}
        </span>
    )
);

const DashboardLayout = () => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [flagDismissed, setFlagDismissed] = useState(false);
    const { user, refreshProfile, logout } = useAuthStore();
    const isMobile = useIsMobile();
    const location = useLocation();
    const currentPageTitle = PAGE_TITLES[location.pathname] || 'PLMun Nexus';
    const isDashboard = location.pathname === '/dashboard';
    const isFlagged = user?.isFlagged;
    const userRole = user?.role || ROLES.STUDENT;
    const { countdown, isBlocked } = useMaintenanceWindow(userRole);

    useEffect(() => {
        setFlagDismissed(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!user) return undefined;

        // Para updated agad kapag na-flag/deactivate ang account sa ibang browser/session.
        refreshProfile();
        const id = setInterval(refreshProfile, 30_000);
        return () => clearInterval(id);
    }, [user, refreshProfile]);

    // Connect the chat WebSocket app-wide so message badges + live delivery
    // work everywhere, and load the conversation list once for the badge.
    const setConversations = useChatStore((s) => s.setConversations);
    useEffect(() => {
        if (!user?.id) return undefined;
        connectChat();
        messageService.listConversations().then(setConversations).catch(() => {});
        return () => disconnectChat();
    }, [user?.id, setConversations]);

    const mainMargin = isMobile ? '0' : (sidebarCollapsed ? '5rem' : '16rem');

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 relative">
            <AnimatedBackground />

            <Sidebar
                collapsed={sidebarCollapsed}
                setCollapsed={setSidebarCollapsed}
                mobileOpen={mobileOpen}
                setMobileOpen={setMobileOpen}
            />

            <main
                className="transition-all duration-300 relative z-10"
                style={{ marginLeft: mainMargin }}
            >
                <header className="sticky top-0 z-30 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between px-3 md:px-5 lg:px-7 py-2.5">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setMobileOpen((open) => !open)}
                                aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
                                aria-expanded={mobileOpen}
                                aria-controls="mobile-sidebar"
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 md:hidden"
                            >
                                <Menu size={22} className="text-gray-600 dark:text-gray-300" />
                            </button>

                            <PageHeaderTitle
                                isDashboard={isDashboard}
                                title={currentPageTitle}
                                user={user}
                            />

                            {isFlagged && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800/30">
                                    <AlertTriangle size={11} />
                                    Flagged
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <NotificationDropdown />
                        </div>
                    </div>
                </header>

                <div className="p-3 md:p-5 lg:p-7 pb-24 md:pb-5 lg:pb-7">
                    <Outlet />
                </div>

                {isBlocked && <MaintenanceOverlay countdown={countdown} />}

                {isFlagged && (
                    <AccountFlagOverlay
                        dismissed={flagDismissed}
                        onDismiss={() => setFlagDismissed(true)}
                        onLogout={logout}
                        overdueCount={user?.overdueCount || 0}
                    />
                )}
            </main>

            <BottomNav />
        </div>
    );
};

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

const NotFound = () => (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
            <AlertTriangle size={36} className="text-gray-400 dark:text-gray-500" />
        </div>
        <h1 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-2">404</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
            The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity shadow-lg shadow-primary/20"
        >
            Go to Dashboard
        </Link>
    </div>
);

const AuthBootSplash = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
    </div>
);

const AppRoutes = () => {
    const initializeAuth = useAuthStore((s) => s.initializeAuth);
    const isInitializing = useAuthStore((s) => s.isInitializing);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

    // On load, re-mint the in-memory access token from the HttpOnly refresh cookie.
    useEffect(() => {
        initializeAuth();
    }, [initializeAuth]);

    // Hold rendering while a persisted session re-mints its token, so
    // ProtectedRoute doesn't prematurely redirect or fire a 401 storm.
    if (isInitializing && isAuthenticated) {
        return <AuthBootSplash />;
    }

    return (
        <Routes>
        <Route
            path="/login"
            element={(
                <PublicRoute>
                    <Login />
                </PublicRoute>
            )}
        />
        <Route
            path="/register"
            element={(
                <PublicRoute>
                    <Register />
                </PublicRoute>
            )}
        />
        <Route path="/deactivated" element={<AccountDeactivated />} />

        <Route
            element={(
                <ProtectedRoute>
                    <DashboardLayout />
                </ProtectedRoute>
            )}
        >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/settings" element={<Settings />} />
            <Route
                path="/reports"
                element={(
                    <RoleGuard minRole={ROLES.STAFF} showAccessDenied>
                        <Reports />
                    </RoleGuard>
                )}
            />
            <Route
                path="/audit-logs"
                element={(
                    <RoleGuard minRole={ROLES.STAFF} showAccessDenied>
                        <AuditLogs />
                    </RoleGuard>
                )}
            />
            <Route
                path="/users"
                element={(
                    <RoleGuard minRole={ROLES.ADMIN} showAccessDenied>
                        <Users />
                    </RoleGuard>
                )}
            />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
        </Routes>
    );
};

export default AppRoutes;
