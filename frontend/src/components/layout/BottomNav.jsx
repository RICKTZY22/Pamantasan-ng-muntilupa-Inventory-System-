import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    SquaresFour as LayoutDashboard,
    Package,
    FileText,
    ChartBar as BarChart3,
    GearSix as Settings,
} from '@phosphor-icons/react';
import useAuthStore from '../../store/authStore';
import { ROLES, hasMinRole } from '../../utils/roles';

const BottomNav = () => {
    const { user } = useAuthStore();
    const role = user?.role;

    const items = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', minRole: null },
        { icon: Package, label: hasMinRole(role, ROLES.STAFF) ? 'Inventory' : 'Items', path: '/inventory', minRole: null },
        { icon: FileText, label: 'Requests', path: '/requests', minRole: null },
        { icon: BarChart3, label: 'Reports', path: '/reports', minRole: ROLES.STAFF },
        { icon: Settings, label: 'Settings', path: '/settings', minRole: null },
    ].filter(item => {
        if (!item.minRole) return true;
        return hasMinRole(role, item.minRole);
    });

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-stretch" style={{ minHeight: 52 }}>
                {items.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            `flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors duration-100 relative ${isActive
                                ? 'text-accent'
                                : 'text-gray-400 dark:text-gray-500'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                {isActive && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-accent rounded-b-full" />
                                )}
                                <item.icon
                                    size={20}
                                    weight={isActive ? 'fill' : 'regular'}
                                />
                                <span>{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default BottomNav;
