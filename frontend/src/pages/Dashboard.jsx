import React, { useEffect, useState, useMemo } from 'react';
import { Package, FileText, Clock, CheckCircle, ArrowCounterClockwise as RotateCcw, Warning as AlertTriangle, WarningCircle as AlertCircle, Plus, Heart } from '@phosphor-icons/react';
import {
    StatChip,
    StatusBars,
    HighlightCard,
    ScheduleRail,
    RecentRequestsTable,
    AreaChartComponent,
    PieChartComponent,
} from '../components/dashboard';
import { Card, DueCountdown } from '../components/ui';
import { StaffOnly } from '../components/auth';
import { useInventory, useRequests } from '../hooks';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { hasMinRole, ROLES } from '../utils/roles';

// Fixed, domain-semantic accent colors (kept independent of the user's theme
// accent so status always reads clearly): available/positive, pending, overdue.
const EMERALD = '#10b981';
const AMBER = '#f59e0b';

const Dashboard = () => {
    const { stats: inventoryStats, inventory, fetchInventory, fetchStats: fetchInventoryStats, getLowStockItems, LOW_STOCK_THRESHOLD, loading: inventoryLoading, error: inventoryError } = useInventory();
    const { stats: requestStats, requests, fetchRequests, checkOverdue, loading: requestsLoading, error: requestsError } = useRequests();
    const [lowStockItems, setLowStockItems] = useState([]);
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const isStaffPlus = hasMinRole(user?.role, ROLES.STAFF);
    const isFaculty = user?.role === ROLES.FACULTY;

    useEffect(() => {
        fetchInventory();
        fetchInventoryStats();
        fetchRequests({ include_cleared: true });
        checkOverdue();
    }, [fetchInventory, fetchInventoryStats, fetchRequests, checkOverdue]);

    useEffect(() => {
        const fetchLowStock = async () => {
            try {
                const items = await getLowStockItems();
                setLowStockItems(items || []);
            } catch (err) {
                setLowStockItems([]);
            }
        };
        fetchLowStock();
    }, [getLowStockItems]);

    // Calculate category data from real inventory
    const categoryData = React.useMemo(() => {
        if (!inventory || inventory.length === 0) {
            return [];
        }
        const categories = {};
        inventory.forEach(item => {
            const cat = item.category || 'Uncategorized';
            categories[cat] = (categories[cat] || 0) + 1;
        });
        return Object.entries(categories).map(([name, value]) => ({ name, value }));
    }, [inventory]);

    const monthlyData = React.useMemo(() => {
        const now = new Date();
        const allCategories = [...new Set(inventory.map(item => item.category || 'OTHER'))];

        // Pre-build 6 month buckets
        const buckets = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            buckets.push({
                month: start.toLocaleString('default', { month: 'short' }),
                start: start.getTime(),
                end: end.getTime(),
                total: 0,
                requests: 0,
                catCounts: new Map(allCategories.map(c => [c, 0])),
            });
        }

        // Helper: find which bucket a timestamp belongs to
        const findBucket = (ts) => buckets.find(b => ts >= b.start && ts < b.end);

        // Single pass over inventory — O(N)
        for (const item of inventory) {
            const ts = new Date(item.dateAdded || item.created_at).getTime();
            const cat = item.category || 'OTHER';
            const b = findBucket(ts);
            if (b) {
                b.total++;
                b.catCounts.set(cat, (b.catCounts.get(cat) || 0) + 1);
            }
        }

        // Single pass over requests — O(R)
        for (const r of requests) {
            const ts = new Date(r.createdAt || r.created_at || r.requestDate).getTime();
            const b = findBucket(ts);
            if (b) {
                b.requests++;
            }
        }

        const months = buckets.map(b => {
            const entry = { month: b.month, total: b.total, requests: b.requests };
            for (const [cat, count] of b.catCounts) entry[cat] = count;
            return entry;
        });

        return { months, categories: allCategories };
    }, [requests, inventory]);

    const isLoading = inventoryLoading || requestsLoading;
    const hasError = inventoryError || requestsError;

    // ── student-scoped derivations ──
    const myRequests = useMemo(() => requests.filter(r => r.requestedById === user?.id), [requests, user?.id]);
    const myStats = useMemo(() => ({
        pending: myRequests.filter(r => r.status === 'PENDING').length,
        approved: myRequests.filter(r => r.status === 'APPROVED').length,
        completed: myRequests.filter(r => r.status === 'COMPLETED' || r.status === 'RETURNED').length,
        overdue: myRequests.filter(r => r.isOverdue).length,
    }), [myRequests]);
    // Student view: only show today's requests
    const myRecent = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return myRequests
            .filter(r => {
                const d = new Date(r.requestDate || r.createdAt || r.created_at);
                return d >= today;
            })
            .slice(0, 5);
    }, [myRequests]);
    const activeBorrows = useMemo(() => myRequests.filter(r => r.status === 'APPROVED' && r.isReturnable && r.expectedReturn), [myRequests]);

    const [favorites, setFavorites] = useState([]);
    useEffect(() => {
        if (!user?.id) return;
        try {
            const stored = JSON.parse(localStorage.getItem(`favorites-${user.id}`) || '[]');
            setFavorites(stored);
        } catch { setFavorites([]); }
    }, [user?.id]);
    const favoriteItems = useMemo(() => inventory.filter(i => favorites.includes(i.id)), [inventory, favorites]);
    const toggleFavorite = (itemId) => {
        if (!user?.id) return;
        const next = favorites.includes(itemId) ? favorites.filter(id => id !== itemId) : [...favorites, itemId];
        setFavorites(next);
        localStorage.setItem(`favorites-${user.id}`, JSON.stringify(next));
    };

    // chart data - last 3 months ng borrowing history
    const monthlyBorrows = useMemo(() => {
        const now = new Date();
        const months = [];
        for (let i = 2; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString('default', { month: 'short' });
            const count = myRequests.filter(r => {
                const rd = new Date(r.requestDate || r.createdAt);
                return rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
            }).length;
            months.push({ month: label, requests: count });
        }
        return months;
    }, [myRequests]);

    // ── shared header band ──
    const firstName = user?.fullName?.split(' ')[0] || 'there';
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // ── Personalized borrower view (Student + Faculty) ──
    if (!isStaffPlus) {
        const myStatusItems = [
            { label: 'Pending', value: myStats.pending, color: 'amber' },
            { label: 'Active Borrows', value: myStats.approved, color: 'emerald' },
            { label: 'Completed', value: myStats.completed, color: 'blue' },
            ...(myStats.overdue > 0 ? [{ label: 'Overdue', value: myStats.overdue, color: 'red' }] : []),
        ];
        const scheduleItems = activeBorrows.map(r => ({
            id: r.id,
            primary: r.itemName || r.item_name || 'Item',
            secondary: `Qty ${r.quantity}`,
            tone: r.isOverdue ? 'red' : 'amber',
            right: <DueCountdown expectedReturn={r.expectedReturn} />,
        }));
        const myRows = myRecent.map(r => ({
            id: r.id,
            item: r.itemName || r.item_name || 'Item',
            status: r.status,
            date: new Date(r.requestDate || r.createdAt || r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        }));

        if (requestsLoading && !requests.length) return <DashboardSkeleton />;

        const facultySubtitle = isFaculty
            ? `Faculty${user?.department ? ` · ${user.department}` : ''}`
            : undefined;

        return (
            <div className="space-y-6">
                <PageHeader firstName={firstName} today={today} subtitle={facultySubtitle} />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <StatChip icon={Clock} value={myStats.pending} label="Pending" tone="amber" />
                            <StatChip icon={CheckCircle} value={myStats.approved} label="Active Borrows" tone="emerald" />
                            <StatChip icon={RotateCcw} value={myStats.completed} label="Completed" tone="blue" />
                            <StatChip icon={AlertTriangle} value={myStats.overdue} label="Overdue" tone={myStats.overdue > 0 ? 'red' : 'gray'} />
                        </div>

                        <StatusBars title="My Requests by Status" items={myStatusItems} />

                        <AreaChartComponent
                            data={monthlyBorrows}
                            dataKey="requests"
                            xAxisKey="month"
                            color={EMERALD}
                            title="My Borrowing History"
                        />

                        <RecentRequestsTable
                            title="My Recent Requests"
                            rows={myRows}
                            showProgress
                            viewAllTo="/requests"
                            emptyMessage="No requests today — browse the inventory to get started."
                        />
                    </div>

                    <div className="space-y-6">
                        <ScheduleRail
                            title="Active Borrows"
                            icon={Clock}
                            items={scheduleItems}
                            emptyMessage="No items to return"
                        />

                        <HighlightCard
                            icon={Plus}
                            title="Need something?"
                            subtitle="Submit a new borrowing request in seconds."
                            actionLabel="New Request"
                            to="/requests"
                            state={{ openNewRequest: true }}
                        />

                        {isFaculty && (
                            <HighlightCard
                                icon={Package}
                                title="Browse the catalog"
                                subtitle="Explore everything available to borrow."
                                actionLabel="Open Inventory"
                                to="/inventory"
                                gradient="from-indigo-500 to-violet-600"
                            />
                        )}

                        <FavoritesCard
                            favoriteItems={favoriteItems}
                            toggleFavorite={toggleFavorite}
                            navigate={navigate}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // ── Management view (Staff/Admin) ──
    if (isLoading && !inventory.length && !requests.length) return <DashboardSkeleton />;

    const total = inventoryStats?.total || 0;
    const available = inventoryStats?.available || 0;
    const inUse = inventoryStats?.inUse || 0;
    const maintenance = inventoryStats?.maintenance || 0;
    const retired = inventoryStats?.retired || 0;
    const inventoryStatusItems = [
        { label: 'Available', value: available, color: 'emerald' },
        { label: 'In Use', value: inUse, color: 'amber' },
        { label: 'Maintenance', value: maintenance, color: 'red' },
        ...(retired > 0 ? [{ label: 'Retired', value: retired, color: 'gray' }] : []),
    ];
    const dueItems = requests
        .filter(r => r.status === 'APPROVED' && r.isReturnable && r.expectedReturn)
        .sort((a, b) => new Date(a.expectedReturn) - new Date(b.expectedReturn))
        .slice(0, 5)
        .map(r => ({
            id: r.id,
            primary: r.itemName || r.item_name || 'Item',
            secondary: r.requestedBy || r.requester_name || 'Unknown',
            tone: r.isOverdue ? 'red' : 'amber',
            right: <DueCountdown expectedReturn={r.expectedReturn} />,
        }));
    const requestRows = requests.slice(0, 6).map(r => ({
        id: r.id,
        requester: r.requestedBy || r.requester_name || 'Unknown',
        item: r.itemName || r.item_name || 'Item',
        status: r.status,
        date: new Date(r.requestDate || r.createdAt || r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        to: '/requests',
    }));

    return (
        <div className="space-y-6">
            <PageHeader firstName={firstName} today={today} />

            {hasError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-6">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="text-red-500" size={24} weight="duotone" />
                        <div>
                            <h3 className="font-semibold text-red-700 dark:text-red-400">Failed to load dashboard data</h3>
                            <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                                {inventoryError || requestsError}. Please check if the backend server is running.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main dashboard charts */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <StatChip icon={Package} value={total} label="Total Items" tone="emerald" hint={`${available} available`} onClick={() => navigate('/inventory')} />
                        <StatChip icon={Clock} value={requestStats?.pending || 0} label="Pending Requests" tone="amber" hint={requestStats?.overdue > 0 ? `${requestStats.overdue} overdue` : 'No urgent requests'} onClick={() => navigate('/requests')} />
                        <StatChip icon={FileText} value={requestStats?.total || 0} label="Total Requests" tone="blue" hint={`${requestStats?.approved || 0} approved`} onClick={() => navigate('/requests')} />
                        <StatChip icon={AlertCircle} value={lowStockItems.length} label="Low Stock" tone={lowStockItems.length > 0 ? 'red' : 'gray'} hint={lowStockItems.length > 0 ? `${maintenance} in maintenance` : 'All stocked'} onClick={() => navigate('/inventory')} />
                    </div>

                    <StatusBars title="Inventory Status" items={inventoryStatusItems} total={total} />

                    <AreaChartComponent
                        data={monthlyData.months}
                        xAxisKey="month"
                        series={[
                            { dataKey: 'requests', name: 'Requests', color: EMERALD },
                            { dataKey: 'total', name: 'Items Added', color: AMBER },
                        ]}
                        title="Activity Report"
                    />

                    <RecentRequestsTable
                        title="Recent Requests"
                        rows={requestRows}
                        viewAllTo="/requests"
                        emptyMessage="No requests yet"
                    />
                </div>

                {/* Side rail */}
                <div className="space-y-6">
                    <ScheduleRail
                        title="Due Soon"
                        icon={Clock}
                        items={dueItems}
                        emptyMessage="Nothing due right now"
                    />

                    <StaffOnly>
                        <HighlightCard
                            icon={AlertTriangle}
                            title={lowStockItems.length > 0 ? `${lowStockItems.length} item${lowStockItems.length !== 1 ? 's' : ''} low on stock` : 'Inventory looks healthy'}
                            subtitle={lowStockItems.length > 0 ? 'Review and restock to avoid shortages.' : 'No items below the threshold.'}
                            actionLabel="View Inventory"
                            to="/inventory"
                            gradient={lowStockItems.length > 0 ? 'from-orange-500 to-red-600' : 'from-emerald-500 to-teal-600'}
                        />
                    </StaffOnly>

                    <PieChartComponent
                        data={categoryData}
                        dataKey="value"
                        nameKey="name"
                        title="Inventory by Category"
                    />
                </div>
            </div>
        </div>
    );
};

// Shared header band: airy date eyebrow + personalized greeting + optional subtitle.
const PageHeader = ({ firstName, today, subtitle }) => (
    <div>
        <p className="text-[11px] font-semibold tracking-wide uppercase text-gray-400 dark:text-gray-500">{today}</p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">Welcome back, {firstName}</h1>
        {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
);

// Restyled favorites widget for the student right rail.
const FavoritesCard = ({ favoriteItems, toggleFavorite, navigate }) => (
    <Card>
        <Card.Header>
            <Card.Title className="flex items-center gap-2">
                <Heart size={16} weight="fill" className="text-rose-500" />
                My Favorites
            </Card.Title>
        </Card.Header>
        <Card.Content>
            {favoriteItems.length === 0 ? (
                <div className="text-center py-6">
                    <Heart size={32} weight="duotone" className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">No favorites yet</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        Star items from the <Link to="/inventory" className="text-[var(--accent)] hover:underline font-medium">Inventory</Link> page!
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {favoriteItems.slice(0, 4).map(item => (
                        <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                                <button onClick={() => toggleFavorite(item.id)} className="text-rose-500 hover:text-rose-600 transition-colors flex-shrink-0">
                                    <Heart size={16} weight="fill" />
                                </button>
                                <div className="min-w-0">
                                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{item.name}</span>
                                    <span className="text-xs text-gray-400">{item.category}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${item.quantity > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
                                    {item.quantity > 0 ? `${item.quantity} avail` : 'Out'}
                                </span>
                                {item.quantity > 0 && (
                                    <button onClick={() => navigate('/requests', { state: { openNewRequest: true } })} className="text-xs text-[var(--accent)] hover:underline font-semibold">
                                        Request
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {favoriteItems.length > 4 && (
                        <p className="text-xs text-center text-gray-400 mt-2">+ {favoriteItems.length - 4} more favorites</p>
                    )}
                </div>
            )}
        </Card.Content>
    </Card>
);

// Loading skeleton matching the new 3-zone layout (chips + status bars + chart + rail).
const DashboardSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        <div>
            <div className="h-3 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-7 w-56 bg-gray-200 dark:bg-gray-700 rounded-lg mt-2" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/50 p-4 shadow-card">
                            <div className="flex items-center gap-3.5">
                                <div className="w-11 h-11 bg-gray-200 dark:bg-gray-700 rounded-xl flex-shrink-0" />
                                <div className="flex-1">
                                    <div className="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded mb-1.5" />
                                    <div className="h-3 w-20 bg-gray-100 dark:bg-gray-700/50 rounded" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 p-5 shadow-card space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i}>
                            <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                            <div className="h-2 w-full bg-gray-100 dark:bg-gray-700/50 rounded-full" />
                        </div>
                    ))}
                </div>
                <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 p-5 shadow-card">
                    <div className="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
                    <div className="h-[260px] bg-gray-100 dark:bg-gray-700/30 rounded-lg" />
                </div>
            </div>
            <div className="space-y-6">
                <div className="h-56 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-card" />
                <div className="h-44 bg-gray-200 dark:bg-gray-700/50 rounded-3xl" />
                <div className="h-72 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 shadow-card" />
            </div>
        </div>
    </div>
);

export default Dashboard;
