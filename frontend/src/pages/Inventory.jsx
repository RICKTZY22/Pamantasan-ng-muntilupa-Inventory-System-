import React, { useState, useEffect, useMemo } from 'react';
import { Plus, MagnifyingGlass as Search, Package, DownloadSimple as Download, Printer, FileText, MapPin, CheckCircle, Wrench, ArrowsClockwise as RefreshCw, Power, ArrowCounterClockwise as RotateCcw, PencilSimple as Edit, Trash as Trash2, QrCode, Star, Eye, ArrowRight, CalendarBlank as Calendar, DotsThree, SlidersHorizontal, StackSimple, Tag, ShieldCheck, ListBullets, SquaresFour } from '@phosphor-icons/react';
import { Button, Modal, QRCodeModal } from '../components/ui';
import { useInventory } from '../hooks';
import { useIsMobile } from '../hooks';
import { StaffOnly } from '../components/auth';
import { InventoryItemCard, InventoryFormModal, InventoryDetailModal } from '../components/inventory';
import { exportCSV, exportPDF } from '../utils/exportUtils';
import useUIStore from '../store/uiStore';
import useAuthStore from '../store/authStore';
import { resolveImageUrl } from '../utils/imageUtils';
import { openPrintPage } from '../utils/printUtils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hasMinRole, ROLES } from '../utils/roles';
import {
    CATEGORY_BADGES,
    LOW_STOCK_THRESHOLD,
    STATUS_COLORS,
} from '../data/inventoryPresentation';

const CATEGORY_OPTIONS = ['ELECTRONICS', 'FURNITURE', 'EQUIPMENT', 'SUPPLIES', 'OTHER'];
const STATUS_OPTIONS = ['AVAILABLE', 'IN_USE', 'MAINTENANCE', 'RETIRED'];

const compactNumber = (value = 0) => Number(value || 0).toLocaleString();

const getStockLabel = (item) => {
    if (item.quantity === 0) return { label: 'Out', className: 'text-red-600 bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/50' };
    if (item.quantity <= LOW_STOCK_THRESHOLD) return { label: 'Low', className: 'text-amber-700 bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50' };
    return { label: 'Healthy', className: 'text-emerald-700 bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/50' };
};

const Inventory = () => {
    const { inventory, loading, stats, fetchInventory, addItem, updateItem, deleteItem, changeItemStatus } = useInventory();
    const { viewMode: storedViewMode, setViewMode, itemsPerPage, showImages } = useUIStore();
    const { user } = useAuthStore();
    const isMobile = useIsMobile();
    // Force card view on mobile - table is unusable on narrow screens
    const viewMode = isMobile ? 'card' : storedViewMode;

    // Load saved staff defaults from Settings -> Inventory Settings tab
    const staffDefaults = useMemo(() => {
        if (!user?.id) return {};
        try {
            const raw = localStorage.getItem(`staff-prefs-${user.id}`);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }, [user?.id]);

    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const defaultFormData = {
        name: '',
        brand: '',
        category: staffDefaults.defaultCategory || 'ELECTRONICS',
        quantity: 1,
        status: staffDefaults.defaultStatus || 'AVAILABLE',
        location: staffDefaults.defaultLocation || '',
        description: '',
        imageUrl: null,
        accessLevel: 'STUDENT',
        isReturnable: true,
        priority: 'MEDIUM',
        borrowDuration: '',
        borrowDurationUnit: 'DAYS',
    };
    const [formData, setFormData] = useState(defaultFormData);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [qrItem, setQrItem] = useState(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteItemId, setDeleteItemId] = useState(null);
    const [detailItem, setDetailItem] = useState(null);
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Auto-open item detail when navigating with ?item=ID (e.g. from dashboard low stock)
    useEffect(() => {
        const itemId = searchParams.get('item');
        if (itemId && inventory && inventory.length > 0) {
            const found = inventory.find(i => String(i.id) === String(itemId));
            if (found) {
                setDetailItem(found);
                // Clean up URL so refreshing doesn't re-open
                searchParams.delete('item');
                setSearchParams(searchParams, { replace: true });
            }
        }
    }, [inventory, searchParams, setSearchParams]);

    const [favorites, setFavorites] = useState([]);
    useEffect(() => {
        if (!user?.id) return;
        try {
            const stored = JSON.parse(localStorage.getItem(`favorites-${user.id}`) || '[]');
            setFavorites(stored);
        } catch { setFavorites([]); }
    }, [user?.id]);
    const toggleFavorite = (e, itemId) => {
        e.stopPropagation();
        e.preventDefault();
        if (!user?.id) return;
        const next = favorites.includes(itemId) ? favorites.filter(id => id !== itemId) : [...favorites, itemId];
        setFavorites(next);
        localStorage.setItem(`favorites-${user.id}`, JSON.stringify(next));
    };

    // Status change modal state
    const [statusModal, setStatusModal] = useState({ open: false, item: null, targetStatus: '' });
    const [statusNote, setStatusNote] = useState('');
    const [maintenanceEta, setMaintenanceEta] = useState('');

    const filteredItems = useMemo(() => {
        if (!inventory) return [];
        return inventory.filter(item => {
            const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase()) || item.category?.toLowerCase().includes(search.toLowerCase());
            const matchCategory = !filterCategory || item.category === filterCategory;
            const matchStatus = !filterStatus || item.status === filterStatus;
            return matchSearch && matchCategory && matchStatus;
        });
    }, [inventory, search, filterCategory, filterStatus]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, filterCategory, filterStatus]);

    // Pagination: slice the flat filtered list, then group the visible page
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));

    // Clamp the current page whenever the result set shrinks (delete, filter,
    // or itemsPerPage change). Without this you can sit on a page past the last
    // valid one: the grid renders empty while Prev/Next still walk ghost pages.
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(start, start + itemsPerPage);
    }, [filteredItems, currentPage, itemsPerPage]);

    const selectedItem = useMemo(() => (
        paginatedItems.find(item => item.id === selectedItemId) || paginatedItems[0] || null
    ), [paginatedItems, selectedItemId]);

    useEffect(() => {
        if (!paginatedItems.length) {
            setSelectedItemId(null);
            return;
        }
        if (!paginatedItems.some(item => item.id === selectedItemId)) {
            setSelectedItemId(paginatedItems[0].id);
        }
    }, [paginatedItems, selectedItemId]);

    const navigate = useNavigate();
    const isStaffPlus = hasMinRole(user?.role, ROLES.STAFF);

    // pag nag-click ng "Request" sa item card, dadalhin sa Requests page
    const handleRequestItem = (item, e) => {
        e?.stopPropagation();
        navigate('/requests', { state: { prefillItem: item } });
    };

    useEffect(() => {
        fetchInventory({ search, category: filterCategory, status: filterStatus });
    }, [search, filterCategory, filterStatus, fetchInventory]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (editingItem) {
            await updateItem(editingItem.id, formData);
        } else {
            await addItem(formData);
        }
        setIsAddModalOpen(false);
        setEditingItem(null);
        setFormData(defaultFormData);
    };

    const handleEdit = (item) => {
        setEditingItem(item);
        setFormData({
            name: item.name || '',
            brand: item.brand || '',
            category: item.category || 'ELECTRONICS',
            quantity: item.quantity ?? 1,
            status: item.status || 'AVAILABLE',
            location: item.location || '',
            description: item.description || '',
            imageUrl: null, // Don't send existing URL back as a file
            accessLevel: item.accessLevel || 'STUDENT',
            isReturnable: item.isReturnable !== undefined ? item.isReturnable : true,
            priority: item.priority || 'MEDIUM',
            borrowDuration: item.borrowDuration ?? '',
            borrowDurationUnit: item.borrowDurationUnit || 'DAYS',
        });
        setIsAddModalOpen(true);
    };

    const handleDelete = (id) => {
        setDeleteItemId(id);
        setDeleteModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (deleteItemId) {
            const result = await deleteItem(deleteItemId);
            if (!result.success) {
                alert(result.error || 'Failed to delete item');
            }
        }
        setDeleteModalOpen(false);
        setDeleteItemId(null);
    };

    const openStatusModal = (item, targetStatus, e) => {
        e?.stopPropagation();
        setStatusModal({ open: true, item, targetStatus });
        setStatusNote('');
        setMaintenanceEta('');
    };

    const handleStatusChange = async () => {
        if (!statusModal.item) return;
        const result = await changeItemStatus(statusModal.item.id, {
            status: statusModal.targetStatus,
            note: statusNote,
            maintenanceEta: statusModal.targetStatus === 'MAINTENANCE' ? maintenanceEta : null,
        });
        if (result.success) {
            // Also refresh detail modal if it's showing this item
            if (detailItem?.id === statusModal.item.id) {
                const updated = inventory.find(i => i.id === statusModal.item.id);
                if (updated) setDetailItem(updated);
            }
        } else {
            alert(result.error || 'Failed to change status');
        }
        setStatusModal({ open: false, item: null, targetStatus: '' });
    };

    // Quick-action: go straight to AVAILABLE without modal
    const handleQuickReturn = async (item, e) => {
        e?.stopPropagation();
        const result = await changeItemStatus(item.id, {
            status: 'AVAILABLE',
            note: `Returned to available from ${item.status}`,
        });
        if (!result.success) alert(result.error || 'Failed to change status');
    };

    // Status action config for quick buttons
    const getStatusActions = (item) => {
        const actions = [];
        switch (item.status) {
            case 'IN_USE':
                actions.push({ label: 'Mark Returned', icon: RotateCcw, color: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20', onClick: (e) => handleQuickReturn(item, e) });
                break;
            case 'MAINTENANCE':
                actions.push({ label: 'Mark Fixed', icon: CheckCircle, color: 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20', onClick: (e) => handleQuickReturn(item, e) });
                break;
            case 'RETIRED':
                actions.push({ label: 'Reactivate', icon: RefreshCw, color: 'text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20', onClick: (e) => handleQuickReturn(item, e) });
                break;
            case 'AVAILABLE':
                actions.push({ label: 'Set Maintenance', icon: Wrench, color: 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20', onClick: (e) => openStatusModal(item, 'MAINTENANCE', e) });
                actions.push({ label: 'Retire', icon: Power, color: 'text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900/20', onClick: (e) => openStatusModal(item, 'RETIRED', e) });
                break;
            default:
                break;
        }
        return actions;
    };

    // Export to CSV
    const handleExportCSV = () => {
        const headers = ['Name', 'Brand', 'Category', 'Quantity', 'Status', 'Location', 'Description', 'Date Added'];
        const rows = inventory.map(item => [
            item.name || '',
            item.brand || '',
            item.category || '',
            item.quantity || 0,
            item.status || '',
            item.location || '',
            item.description || '',
            item.dateAdded || item.created_at || '',
        ]);
        exportCSV('inventory', headers, rows);
    };

    // Export to PDF
    const handleExportPDF = () => {
        const headers = ['Name', 'Brand', 'Category', 'Qty', 'Status', 'Location', 'Priority'];
        const rows = inventory.map(item => [
            item.name || '',
            item.brand || '',
            item.category || '',
            item.quantity || 0,
            item.status || '',
            item.location || '',
            item.priority || 'MEDIUM',
        ]);
        const summary = {
            'Total Items': stats?.total || inventory.length,
            'Available': stats?.available || 0,
            'In Use': stats?.inUse || 0,
            'Maintenance': stats?.maintenance || 0,
        };
        exportPDF('inventory_items', 'PLMun Inventory Items List', headers, rows, { summary });
    };

    // Print inventory
    const handlePrint = () => {
        openPrintPage({
            title: 'PLMun Inventory Report',
            styles: `
                body { font-family: Arial, sans-serif; padding: 20px; }
                h1 { color: #1a1a1a; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; }
                .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                .stat { padding: 10px; background: #f5f5f5; border-radius: 8px; }
            `,
            buildBody: (doc, body, textNode) => {
                textNode(doc, body, 'h1', 'PLMun Inventory Report');
                textNode(doc, body, 'p', `Generated on: ${new Date().toLocaleString()}`);

                const statsWrap = doc.createElement('div');
                statsWrap.className = 'stats';
                [
                    ['Total', stats.total],
                    ['Available', stats.available],
                    ['In Use', stats.inUse],
                    ['Maintenance', stats.maintenance],
                ].forEach(([label, value]) => {
                    const stat = doc.createElement('div');
                    stat.className = 'stat';
                    const strong = doc.createElement('strong');
                    strong.textContent = `${label}: `;
                    stat.appendChild(strong);
                    stat.appendChild(doc.createTextNode(String(value ?? 0)));
                    statsWrap.appendChild(stat);
                });
                body.appendChild(statsWrap);

                const table = doc.createElement('table');
                const thead = doc.createElement('thead');
                const headRow = doc.createElement('tr');
                ['Name', 'Category', 'Quantity', 'Status', 'Location'].forEach((heading) => {
                    textNode(doc, headRow, 'th', heading);
                });
                thead.appendChild(headRow);
                table.appendChild(thead);

                const tbody = doc.createElement('tbody');
                inventory.forEach((item) => {
                    const row = doc.createElement('tr');
                    [item.name, item.category, item.quantity, item.status, item.location].forEach((value) => {
                        textNode(doc, row, 'td', value);
                    });
                    tbody.appendChild(row);
                });
                table.appendChild(tbody);
                body.appendChild(table);
            },
        });
    };

    return (
        <>
            <div className="space-y-4">
                {/* Inventory workspace */}
                <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/80 overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold text-gray-950 dark:text-white">Inventory</h1>
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300">
                                    {compactNumber(filteredItems.length)} shown
                                </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track stock, item status, access levels, and staff actions in one working view.</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <div className="hidden rounded-md border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-gray-800 md:flex">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('table')}
                                    className={`flex h-8 w-8 items-center justify-center rounded ${viewMode === 'table' ? 'bg-white text-primary shadow-sm dark:bg-gray-700' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                                    title="Table view"
                                >
                                    <ListBullets size={17} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('card')}
                                    className={`flex h-8 w-8 items-center justify-center rounded ${viewMode === 'card' ? 'bg-white text-primary shadow-sm dark:bg-gray-700' : 'text-gray-500 hover:text-gray-900 dark:hover:text-gray-200'}`}
                                    title="Card view"
                                >
                                    <SquaresFour size={17} />
                                </button>
                            </div>
                            <StaffOnly>
                                <button type="button" onClick={handleExportCSV} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                                    <Download size={16} /> CSV
                                </button>
                                <button type="button" onClick={handleExportPDF} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                                    <FileText size={16} /> PDF
                                </button>
                                <button type="button" onClick={handlePrint} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800" title="Print">
                                    <Printer size={16} />
                                </button>
                                <button type="button" onClick={() => setIsAddModalOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-white shadow-sm shadow-primary/20 hover:opacity-90">
                                    <Plus size={16} /> Add item
                                </button>
                            </StaffOnly>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
                        <div className="min-w-0">
                            {/* Search and filters */}
                            <div className="flex flex-col gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800 xl:flex-row xl:items-center">
                                <div className="relative min-w-0 flex-1">
                                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Quick search by item or category"
                                        className="h-10 w-full rounded-md border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:bg-gray-900"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2 sm:flex">
                                    <label className="relative">
                                        <SlidersHorizontal size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <select
                                            className="h-10 min-w-40 appearance-none rounded-md border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                            value={filterCategory}
                                            onChange={(e) => setFilterCategory(e.target.value)}
                                        >
                                            <option value="">All categories</option>
                                            {CATEGORY_OPTIONS.map(category => <option key={category} value={category}>{category}</option>)}
                                        </select>
                                    </label>
                                    <label className="relative">
                                        <StackSimple size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <select
                                            className="h-10 min-w-36 appearance-none rounded-md border border-gray-200 bg-gray-50 pl-9 pr-8 text-sm text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                                            value={filterStatus}
                                            onChange={(e) => setFilterStatus(e.target.value)}
                                        >
                                            <option value="">All status</option>
                                            {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                                        </select>
                                    </label>
                                </div>
                            </div>

                            {/* Item table or card grid */}
                            {loading ? (
                                <div className="flex min-h-[420px] items-center justify-center">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                    <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">Loading inventory...</span>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="flex min-h-[420px] flex-col items-center justify-center px-4 text-center">
                                    <Package size={42} className="text-gray-300 dark:text-gray-600" />
                                    <p className="mt-3 text-sm font-medium text-gray-700 dark:text-gray-200">No inventory records found</p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Try clearing filters or adding a new item.</p>
                                </div>
                            ) : viewMode === 'card' ? (
                                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                                    {paginatedItems.map(item => (
                                        <InventoryItemCard
                                            key={item.id}
                                            item={item}
                                            showImages={showImages}
                                            isFavorite={favorites.includes(item.id)}
                                            isStaffPlus={isStaffPlus}
                                            onToggleFavorite={toggleFavorite}
                                            onViewDetail={setDetailItem}
                                            onRequestItem={handleRequestItem}
                                            onEdit={handleEdit}
                                            onDelete={handleDelete}
                                            onQrCode={(item) => { setQrItem(item); setQrModalOpen(true); }}
                                            getStatusActions={getStatusActions}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[920px] text-sm">
                                        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                                            <tr>
                                                <th className="w-10 px-4 py-3 text-left">#</th>
                                                <th className="px-3 py-3 text-left">Item</th>
                                                <th className="px-3 py-3 text-left">Group</th>
                                                <th className="px-3 py-3 text-left">Status</th>
                                                <th className="px-3 py-3 text-left">Stock</th>
                                                <th className="px-3 py-3 text-left">Access</th>
                                                <th className="px-3 py-3 text-left">Location</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {paginatedItems.map((item, index) => {
                                                const stock = getStockLabel(item);
                                                const selected = selectedItem?.id === item.id;
                                                return (
                                                    <tr
                                                        key={item.id}
                                                        onClick={() => setSelectedItemId(item.id)}
                                                        className={`${selected ? 'bg-primary/[0.06] dark:bg-primary/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'} cursor-pointer transition-colors`}
                                                    >
                                                        <td className="px-4 py-3 text-xs text-gray-400">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex min-w-0 items-center gap-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => toggleFavorite(e, item.id)}
                                                                    className={`flex h-7 w-7 flex-none items-center justify-center rounded-md ${favorites.includes(item.id) ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}
                                                                    title={favorites.includes(item.id) ? 'Remove favorite' : 'Add favorite'}
                                                                >
                                                                    <Star size={15} fill={favorites.includes(item.id) ? 'currentColor' : 'none'} />
                                                                </button>
                                                                {showImages && (
                                                                    item.imageUrl ? (
                                                                        <img src={resolveImageUrl(item.imageUrl)} alt={item.name} className="h-10 w-10 flex-none rounded-md border border-gray-200 object-cover dark:border-gray-700" onError={(e) => { e.target.style.display = 'none'; }} />
                                                                    ) : (
                                                                        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs font-bold text-gray-500 dark:border-gray-700 dark:bg-gray-800">
                                                                            {CATEGORY_BADGES[item.category] || 'OT'}
                                                                        </span>
                                                                    )
                                                                )}
                                                                <div className="min-w-0">
                                                                    <p className="truncate font-semibold text-gray-900 dark:text-gray-100">{item.name}</p>
                                                                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{item.description || 'No description'}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                                                                <Tag size={12} /> {item.category || 'OTHER'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[item.status] || STATUS_COLORS.AVAILABLE}`}>
                                                                {item.status?.replace('_', ' ') || 'AVAILABLE'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-gray-900 dark:text-gray-100">{item.quantity}</span>
                                                                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stock.className}`}>{stock.label}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                                                                <ShieldCheck size={13} className="text-primary" /> {item.accessLevel || 'STUDENT'}+
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3">
                                                            <span className="inline-flex max-w-[160px] items-center gap-1 truncate text-xs text-gray-600 dark:text-gray-300">
                                                                <MapPin size={13} className="flex-none text-gray-400" /> {item.location || 'No location'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                            <div className="flex justify-end gap-1">
                                                                <button type="button" onClick={() => setDetailItem(item)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white" title="View details">
                                                                    <Eye size={16} />
                                                                </button>
                                                                {item.status === 'AVAILABLE' && item.quantity > 0 && (
                                                                    <button type="button" onClick={(e) => handleRequestItem(item, e)} className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" title="Request item">
                                                                        <FileText size={16} />
                                                                    </button>
                                                                )}
                                                                <StaffOnly>
                                                                    {getStatusActions(item).slice(0, 1).map((action) => {
                                                                        const ActionIcon = action.icon;
                                                                        return (
                                                                            <button key={action.label} type="button" onClick={action.onClick} className={`flex h-8 w-8 items-center justify-center rounded-md ${action.color}`} title={action.label}>
                                                                                <ActionIcon size={16} />
                                                                            </button>
                                                                        );
                                                                    })}
                                                                    <button type="button" onClick={() => { setQrItem(item); setQrModalOpen(true); }} className="flex h-8 w-8 items-center justify-center rounded-md text-primary hover:bg-primary/10" title="QR code">
                                                                        <QrCode size={16} />
                                                                    </button>
                                                                    <button type="button" onClick={() => handleEdit(item)} className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white" title="Edit">
                                                                        <Edit size={16} />
                                                                    </button>
                                                                    <button type="button" onClick={() => handleDelete(item.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </StaffOnly>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {!loading && filteredItems.length > 0 && (
                                <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Showing <span className="font-semibold text-gray-800 dark:text-gray-200">{(currentPage - 1) * itemsPerPage + 1}</span>-<span className="font-semibold text-gray-800 dark:text-gray-200">{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> of <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredItems.length}</span>
                                    </p>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Prev</button>
                                        <span className="px-3 text-sm text-gray-500 dark:text-gray-400">{currentPage} / {totalPages}</span>
                                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Next</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Inventory side summary */}
                        <aside className="border-t border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-950/30 lg:border-l lg:border-t-0">
                            <div className="space-y-5">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Overview</p>
                                    <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-1">
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">SKU Total</p>
                                            <p className="mt-1 text-2xl font-bold text-gray-950 dark:text-white">{compactNumber(stats.total || inventory.length)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Available</p>
                                            <p className="mt-1 text-2xl font-bold text-emerald-600">{compactNumber(stats.available)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">In Use</p>
                                            <p className="mt-1 text-2xl font-bold text-blue-600">{compactNumber(stats.inUse)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Stock Issues</p>
                                            <p className="mt-1 text-2xl font-bold text-red-600">{filteredItems.filter(i => i.quantity === 0 || (i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD)).length}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Category Mix</p>
                                    <div className="mt-3 space-y-2">
                                        {CATEGORY_OPTIONS.map(category => {
                                            const count = filteredItems.filter(item => item.category === category).length;
                                            const width = filteredItems.length ? Math.max(6, (count / filteredItems.length) * 100) : 0;
                                            return (
                                                <div key={category}>
                                                    <div className="mb-1 flex items-center justify-between text-xs">
                                                        <span className="font-medium text-gray-600 dark:text-gray-300">{category}</span>
                                                        <span className="text-gray-400">{count}</span>
                                                    </div>
                                                    <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-800">
                                                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${width}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
                                    <div className="mb-3 flex items-center justify-between">
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Selected Item</p>
                                        <DotsThree size={18} className="text-gray-400" />
                                    </div>
                                    {selectedItem ? (
                                        <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                                            <div className="flex items-start gap-3">
                                                {selectedItem.imageUrl ? (
                                                    <img src={resolveImageUrl(selectedItem.imageUrl)} alt={selectedItem.name} className="h-16 w-16 rounded-md object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                                                ) : (
                                                    <div className="flex h-16 w-16 items-center justify-center rounded-md bg-gray-100 text-sm font-bold text-gray-500 dark:bg-gray-800">
                                                        {CATEGORY_BADGES[selectedItem.category] || 'OT'}
                                                    </div>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">{selectedItem.name}</p>
                                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedItem.category}</p>
                                                </div>
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                                                <div>
                                                    <p className="text-xl font-bold text-gray-950 dark:text-white">{selectedItem.quantity}</p>
                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Units</p>
                                                </div>
                                                <div>
                                                    <p className="text-xl font-bold text-gray-950 dark:text-white">{selectedItem.priority || 'MEDIUM'}</p>
                                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Priority</p>
                                                </div>
                                            </div>
                                            <button type="button" onClick={() => setDetailItem(selectedItem)} className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                                                Open details <ArrowRight size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">Select a row to preview item details.</p>
                                    )}
                                </div>
                            </div>
                        </aside>
                    </div>
                </section>

                {/* Add/edit item modal */}
                <InventoryFormModal
                    isOpen={isAddModalOpen}
                    onClose={() => {
                        setIsAddModalOpen(false);
                        setEditingItem(null);
                        setFormData(defaultFormData);
                    }}
                    onSubmit={handleSubmit}
                    editingItem={editingItem}
                    formData={formData}
                    setFormData={setFormData}
                />

                {/* QR code modal */}
                <QRCodeModal
                    isOpen={qrModalOpen}
                    onClose={() => {
                        setQrModalOpen(false);
                        setQrItem(null);
                    }}
                    item={qrItem}
                />

                {/* Delete confirmation modal */}
                <Modal
                    isOpen={deleteModalOpen}
                    onClose={() => {
                        setDeleteModalOpen(false);
                        setDeleteItemId(null);
                    }}
                    title="Delete Item"
                    description="Are you sure you want to delete this item? This action cannot be undone."
                    size="sm"
                >
                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            className="flex-1"
                            onClick={() => {
                                setDeleteModalOpen(false);
                                setDeleteItemId(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="danger"
                            className="flex-1"
                            onClick={handleDeleteConfirm}
                        >
                            <Trash2 size={16} className="mr-1" />
                            Delete
                        </Button>
                    </div>
                </Modal>

                {/* Item detail modal */}
                <InventoryDetailModal
                    item={detailItem}
                    isOpen={!!detailItem}
                    onClose={() => setDetailItem(null)}
                    isStaffPlus={isStaffPlus}
                    getStatusActions={getStatusActions}
                />

                {/* Status change modal */}
                <Modal
                    isOpen={statusModal.open}
                    onClose={() => setStatusModal({ open: false, item: null, targetStatus: '' })}
                    title={`Change Status to ${statusModal.targetStatus?.replace('_', ' ')}`}
                    size="sm"
                >
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Item:</span>
                            <span className="font-semibold text-sm text-gray-900 dark:text-white">{statusModal.item?.name}</span>
                            <ArrowRight size={14} className="text-gray-400" />
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[statusModal.targetStatus] || 'bg-gray-100 text-gray-700'}`}>
                                {statusModal.targetStatus?.replace('_', ' ')}
                            </span>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                Reason / Note <span className="text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                value={statusNote}
                                onChange={(e) => setStatusNote(e.target.value)}
                                rows={3}
                                placeholder={statusModal.targetStatus === 'MAINTENANCE' ? 'e.g., Screen cracked - sent for repair' : statusModal.targetStatus === 'RETIRED' ? 'e.g., Obsolete, beyond economical repair' : 'Enter a reason...'}
                                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                            />
                        </div>

                        {statusModal.targetStatus === 'MAINTENANCE' && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    <Calendar size={12} className="inline mr-1" />
                                    Estimated Return Date <span className="text-gray-400">(optional)</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    value={maintenanceEta}
                                    onChange={(e) => setMaintenanceEta(e.target.value)}
                                    className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                />
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <Button
                                type="button"
                                variant="ghost"
                                className="flex-1"
                                onClick={() => setStatusModal({ open: false, item: null, targetStatus: '' })}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={handleStatusChange}
                            >
                                Confirm Change
                            </Button>
                        </div>
                    </div>
                </Modal>
            </div>
        </>
    );
};

export default Inventory;
