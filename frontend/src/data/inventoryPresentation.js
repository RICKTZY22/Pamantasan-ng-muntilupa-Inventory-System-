export const LOW_STOCK_THRESHOLD = 5;

export const STATUS_COLORS = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    IN_USE: 'bg-blue-100 text-blue-700',
    MAINTENANCE: 'bg-amber-100 text-amber-700',
    RETIRED: 'bg-gray-100 text-gray-700',
};

export const CATEGORY_BADGES = {
    ELECTRONICS: 'PC',
    FURNITURE: 'FN',
    EQUIPMENT: 'EQ',
    SUPPLIES: 'SP',
    OTHER: 'OT',
};

export const getStockGroups = ({ XCircle, TrendingDown, CheckCircle }) => [
    {
        key: 'OUT_OF_STOCK',
        label: 'Out of Stock',
        icon: XCircle,
        color: 'bg-red-500',
        textColor: 'text-red-700 dark:text-red-400',
        bgLight: 'bg-red-50 dark:bg-red-900/10',
        borderColor: 'border-red-200 dark:border-red-800/30',
        filter: item => item.quantity === 0,
    },
    {
        key: 'LOW_STOCK',
        label: 'Low Stock',
        icon: TrendingDown,
        color: 'bg-amber-500',
        textColor: 'text-amber-700 dark:text-amber-400',
        bgLight: 'bg-amber-50 dark:bg-amber-900/10',
        borderColor: 'border-amber-200 dark:border-amber-800/30',
        filter: item => item.quantity > 0 && item.quantity <= LOW_STOCK_THRESHOLD,
    },
    {
        key: 'NORMAL_STOCK',
        label: 'Normal Stock',
        icon: CheckCircle,
        color: 'bg-emerald-500',
        textColor: 'text-emerald-700 dark:text-emerald-400',
        bgLight: 'bg-emerald-50 dark:bg-emerald-900/10',
        borderColor: 'border-emerald-200 dark:border-emerald-800/30',
        filter: item => item.quantity > LOW_STOCK_THRESHOLD,
    },
];

export const getPriorityBadgeClass = (priority = 'MEDIUM') => {
    if (priority === 'HIGH') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    if (priority === 'LOW') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
};

export const getPriorityMarker = (priority = 'MEDIUM') => {
    if (priority === 'HIGH') return 'High';
    if (priority === 'LOW') return 'Low';
    return 'Medium';
};
