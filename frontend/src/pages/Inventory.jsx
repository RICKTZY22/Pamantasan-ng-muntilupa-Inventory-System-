import React, { useState, useEffect, useMemo } from 'react';
import { Plus, MagnifyingGlass as Search, Package, DownloadSimple as Download, Printer, FileText, MapPin, CaretDown as ChevronDown, CaretRight as ChevronRight, TrendDown as TrendingDown, CheckCircle, XCircle, Wrench, ArrowsClockwise as RefreshCw, Power, ArrowCounterClockwise as RotateCcw, PencilSimple as Edit, Trash as Trash2, QrCode, Warning as AlertTriangle, Star, Eye, ArrowRight, CalendarBlank as Calendar } from '@phosphor-icons/react';
import { Button, Input, Card, Modal, Table, QRCodeModal } from '../components/ui';
import { useInventory } from '../hooks';
import { useIsMobile } from '../hooks';
import { StaffOnly } from '../components/auth';
import { InventoryItemCard, InventoryFormModal, InventoryDetailModal } from '../components/inventory';
import { exportCSV, exportPDF } from '../utils/exportUtils';
import useUIStore from '../store/uiStore';
import useAuthStore from '../store/authStore';
import { resolveImageUrl } from '../utils/imageUtils';
import { escapeHtml } from '../utils/htmlUtils';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { hasMinRole, ROLES } from '../utils/roles';
import {
    CATEGORY_BADGES,
    LOW_STOCK_THRESHOLD,
    STATUS_COLORS,
    getPriorityBadgeClass,
    getPriorityMarker,
    getStockGroups,
} from '../data/inventoryPresentation';

const Inventory = () => {
    const { inventory, loading, stats, fetchInventory, addItem, updateItem, deleteItem, changeItemStatus } = useInventory();
    const { viewMode: storedViewMode, itemsPerPage, showImages } = useUIStore();
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
    const [collapsedSections, setCollapsedSections] = useState({});
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

    // favorites system - naka-save sa localStorage per user
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

    // pag-filter ng items na naka-memo para hindi mag re-render nang paulit-ulit
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
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredItems.slice(start, start + itemsPerPage);
    }, [filteredItems, currentPage, itemsPerPage]);

    const stockGroups = useMemo(
        () => getStockGroups({ XCircle, TrendingDown, CheckCircle }),
        [],
    );
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
            category: item.category || 'ELECTRONICS',
            quantity: item.quantity || 1,
            status: item.status || 'AVAILABLE',
            location: item.location || '',
            description: item.description || '',
            imageUrl: null, // Don't send existing URL back as a file
            accessLevel: item.accessLevel || 'STUDENT',
            isReturnable: item.isReturnable !== undefined ? item.isReturnable : true,
            priority: item.priority || 'MEDIUM',
            borrowDuration: item.borrowDuration || '',
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

    // status change helpers
    // FIXME: medyo magulo 'tong state management, refactor pag may time
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
        const headers = ['Name', 'Category', 'Quantity', 'Status', 'Location', 'Description', 'Date Added'];
        const rows = inventory.map(item => [
            item.name || '',
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
        const headers = ['Name', 'Category', 'Qty', 'Status', 'Location', 'Priority'];
        const rows = inventory.map(item => [
            item.name || '',
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
        const safeStats = {
            total: escapeHtml(stats.total),
            available: escapeHtml(stats.available),
            inUse: escapeHtml(stats.inUse),
            maintenance: escapeHtml(stats.maintenance),
        };

        const printContent = `
            <html>
            <head>
                <title>PLMun Inventory Report</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    h1 { color: #1a1a1a; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f5f5f5; }
                    .stats { display: flex; gap: 20px; margin-bottom: 20px; }
                    .stat { padding: 10px; background: #f5f5f5; border-radius: 8px; }
                </style>
            </head>
            <body>
                <h1>PLMun Inventory Report</h1>
                <p>Generated on: ${escapeHtml(new Date().toLocaleString())}</p>
                <div class="stats">
                    <div class="stat"><strong>Total:</strong> ${safeStats.total}</div>
                    <div class="stat"><strong>Available:</strong> ${safeStats.available}</div>
                    <div class="stat"><strong>In Use:</strong> ${safeStats.inUse}</div>
                    <div class="stat"><strong>Maintenance:</strong> ${safeStats.maintenance}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Quantity</th>
                            <th>Status</th>
                            <th>Location</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inventory.map(item => `
                            <tr>
                                <td>${escapeHtml(item.name)}</td>
                                <td>${escapeHtml(item.category)}</td>
                                <td>${escapeHtml(item.quantity)}</td>
                                <td>${escapeHtml(item.status)}</td>
                                <td>${escapeHtml(item.location)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Inventory</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-0.5 text-sm">Manage your inventory items</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <StaffOnly>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleExportCSV(); }}
                                className="p-2 md:px-3 md:py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer flex items-center gap-1.5 transition-colors"
                                title="Export CSV"
                            >
                                <Download size={16} />
                                <span className="hidden md:inline">CSV</span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleExportPDF(); }}
                                className="p-2 md:px-3 md:py-2 text-sm font-medium bg-primary/10 text-primary rounded-xl hover:bg-primary/20 cursor-pointer flex items-center gap-1.5 transition-colors"
                                title="Export PDF"
                            >
                                <FileText size={16} />
                                <span className="hidden md:inline">PDF</span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handlePrint(); }}
                                className="p-2 md:px-3 md:py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer flex items-center gap-1.5 transition-colors"
                                title="Print"
                            >
                                <Printer size={16} />
                                <span className="hidden md:inline">Print</span>
                            </button>
                        </StaffOnly>
                        <StaffOnly>
                            <Button icon={Plus} onClick={() => setIsAddModalOpen(true)}>
                                Add Item
                            </Button>
                        </StaffOnly>
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4">
                    <Card className="relative overflow-hidden py-3 md:py-5 px-3 md:px-4">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-primary/5 dark:bg-primary/10 rounded-bl-full" />
                        <Package size={18} className="text-primary mb-1.5" />
                        <p className="text-lg md:text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Total Items</p>
                    </Card>
                    <Card className="relative overflow-hidden py-3 md:py-5 px-3 md:px-4">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-bl-full" />
                        <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-1.5">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />
                        </div>
                        <p className="text-lg md:text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.available}</p>
                        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Available</p>
                    </Card>
                    <Card className="relative overflow-hidden py-3 md:py-5 px-3 md:px-4">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 dark:bg-blue-500/10 rounded-bl-full" />
                        <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-1.5">
                            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-blue-500" />
                        </div>
                        <p className="text-lg md:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.inUse}</p>
                        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">In Use</p>
                    </Card>
                    <Card className="relative overflow-hidden py-3 md:py-5 px-3 md:px-4">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 dark:bg-amber-500/10 rounded-bl-full" />
                        <TrendingDown size={18} className="text-amber-500 mb-1.5" />
                        <p className="text-lg md:text-2xl font-bold text-amber-600 dark:text-amber-400">{filteredItems.filter(i => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD).length}</p>
                        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Low Stock</p>
                    </Card>
                    <Card className="relative overflow-hidden py-3 md:py-5 px-3 md:px-4">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-red-500/5 dark:bg-red-500/10 rounded-bl-full" />
                        <XCircle size={18} className="text-red-500 mb-1.5" />
                        <p className="text-lg md:text-2xl font-bold text-red-600 dark:text-red-400">{filteredItems.filter(i => i.quantity === 0).length}</p>
                        <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">Out of Stock</p>
                    </Card>
                </div>

                {/* Filters */}
                <Card>
                    <div className="flex flex-col md:flex-row gap-2 md:gap-4">
                        <div className="flex-1">
                            <Input
                                icon={Search}
                                placeholder="Search items..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="flex gap-2">
                            <select
                                className="flex-1 md:flex-none px-3 py-2.5 md:px-4 md:py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none transition-colors"
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                            >
                                <option value="">All Categories</option>
                                <option value="ELECTRONICS">Electronics</option>
                                <option value="FURNITURE">Furniture</option>
                                <option value="EQUIPMENT">Equipment</option>
                                <option value="SUPPLIES">Supplies</option>
                                <option value="OTHER">Other</option>
                            </select>
                            <select
                                className="flex-1 md:flex-none px-3 py-2.5 md:px-4 md:py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none transition-colors"
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                            >
                                <option value="">All Status</option>
                                <option value="AVAILABLE">Available</option>
                                <option value="IN_USE">In Use</option>
                                <option value="MAINTENANCE">Maintenance</option>
                                <option value="RETIRED">Retired</option>
                            </select>
                        </div>
                    </div>
                </Card>

                {/* Items Display - Grouped by Stock Level */}
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                        <span className="ml-3 text-gray-500 dark:text-gray-400">Loading inventory...</span>
                    </div>
                ) : filteredItems.length === 0 ? (
                    <Card className="py-12 text-center">
                        <Package size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm">No items found matching your filters</p>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {stockGroups.map(group => {
                            const groupItems = paginatedItems.filter(group.filter);
                            if (groupItems.length === 0) return null;
                            const isCollapsed = collapsedSections[group.key];
                            const GroupIcon = group.icon;

                            return (
                                <div key={group.key} className={`rounded-xl border ${group.borderColor} overflow-hidden`}>
                                    {/* Group header - clickable to collapse */}
                                    <button
                                        type="button"
                                        onClick={() => setCollapsedSections(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                                        className={`w-full flex items-center justify-between px-4 py-3 ${group.bgLight} cursor-pointer hover:opacity-90 transition-opacity`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${group.color} text-white`}>
                                                <GroupIcon size={16} />
                                            </span>
                                            <span className={`font-semibold text-sm ${group.textColor}`}>{group.label}</span>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${group.color} text-white`}>
                                                {groupItems.length}
                                            </span>
                                        </div>
                                        {isCollapsed ? <ChevronRight size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                                    </button>

                                    {/* Group body */}
                                    {!isCollapsed && (
                                        viewMode === 'card' ? (
                                            /* ===== CARD VIEW ===== */
                                            <div className="p-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                    {groupItems.map(item => (
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
                                            </div>
                                        ) : (
                                            /* ===== TABLE VIEW ===== */
                                            <Table>
                                                <Table.Header>
                                                    <Table.Row>
                                                        <Table.Head>Item</Table.Head>
                                                        <Table.Head>Category</Table.Head>
                                                        <Table.Head>Quantity</Table.Head>
                                                        <Table.Head>Status</Table.Head>
                                                        <Table.Head>Priority</Table.Head>
                                                        <Table.Head>Location</Table.Head>
                                                        <Table.Head className="text-right"><StaffOnly>Actions</StaffOnly></Table.Head>
                                                    </Table.Row>
                                                </Table.Header>
                                                <Table.Body>
                                                    {groupItems.map(item => (
                                                        <Table.Row key={item.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors duration-200" onClick={() => setDetailItem(item)}>
                                                            <Table.Cell>
                                                                <div className="flex items-center gap-3">
                                                                    {showImages && (
                                                                        item.imageUrl ? (
                                                                            <img src={resolveImageUrl(item.imageUrl)} alt={item.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-600 transition-transform duration-200 hover:scale-110" onError={(e) => { e.target.style.display = 'none'; }} />
                                                                        ) : (
                                                                            <span className="text-sm font-bold">{CATEGORY_BADGES[item.category] || 'OT'}</span>
                                                                        )
                                                                    )}
                                                                    <span className="font-medium hover:text-primary transition-colors">{item.name}</span>
                                                                </div>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <span className="inline-flex items-center gap-1 text-sm">
                                                                    {CATEGORY_BADGES[item.category] || 'OT'} {item.category}
                                                                </span>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`font-semibold ${item.quantity === 0 ? 'text-red-600 dark:text-red-400' : item.quantity <= 5 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                                                        {item.quantity}
                                                                    </span>
                                                                </div>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[item.status]}`}>
                                                                    {item.status}
                                                                </span>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getPriorityBadgeClass(item.priority)}`}>
                                                                    {getPriorityMarker(item.priority)} {item.priority || 'MEDIUM'}
                                                                </span>
                                                            </Table.Cell>
                                                            <Table.Cell>
                                                                <div className="flex items-center gap-1 text-sm">
                                                                    <MapPin size={12} className="text-gray-400" />
                                                                    {item.location || '-'}
                                                                </div>
                                                            </Table.Cell>
                                                            <Table.Cell onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex justify-end gap-1">
                                                                    {item.status === 'AVAILABLE' && item.quantity > 0 && (
                                                                        <Button variant="ghost" size="sm" onClick={(e) => handleRequestItem(item, e)} title="Request This Item" className="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><FileText size={16} /></Button>
                                                                    )}
                                                                    <StaffOnly>
                                                                        {getStatusActions(item).map((action, idx) => {
                                                                            const ActionIcon = action.icon;
                                                                            return (
                                                                                <Button key={idx} variant="ghost" size="sm" onClick={action.onClick} title={action.label} className={action.color}>
                                                                                    <ActionIcon size={16} />
                                                                                </Button>
                                                                            );
                                                                        })}
                                                                        <Button variant="ghost" size="sm" onClick={() => { setQrItem(item); setQrModalOpen(true); }} title="QR Code"><QrCode size={16} className="text-primary" /></Button>
                                                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(item)} title="Edit"><Edit size={16} /></Button>
                                                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} title="Delete"><Trash2 size={16} className="text-red-500" /></Button>
                                                                    </StaffOnly>
                                                                </div>
                                                            </Table.Cell>
                                                        </Table.Row>
                                                    ))}
                                                </Table.Body>
                                            </Table>
                                        )
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination Controls */}
                {!loading && filteredItems.length > itemsPerPage && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 px-4 py-3">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Showing <span className="font-semibold text-gray-700 dark:text-gray-200">{(currentPage - 1) * itemsPerPage + 1}</span>-<span className="font-semibold text-gray-700 dark:text-gray-200">{Math.min(currentPage * itemsPerPage, filteredItems.length)}</span> of <span className="font-semibold text-gray-700 dark:text-gray-200">{filteredItems.length}</span> items
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Prev
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                .reduce((acc, p, i, arr) => {
                                    if (i > 0 && p - arr[i - 1] > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) =>
                                    p === '...' ? (
                                        <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
                                    ) : (
                                        <button
                                            key={p}
                                            onClick={() => setCurrentPage(p)}
                                            className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                                                currentPage === p
                                                    ? 'bg-primary text-white shadow-sm'
                                                    : 'border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    )
                                )
                            }
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {/* Summary footer */}
                {!loading && filteredItems.length > 0 && (
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                        <p>Showing {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} across {stockGroups.filter(g => filteredItems.some(g.filter)).length} group{stockGroups.filter(g => filteredItems.some(g.filter)).length !== 1 ? 's' : ''}</p>
                    </div>
                )}

                {/* Add/Edit Modal - extracted to InventoryFormModal */}
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

                {/* QR Code Modal */}
                <QRCodeModal
                    isOpen={qrModalOpen}
                    onClose={() => {
                        setQrModalOpen(false);
                        setQrItem(null);
                    }}
                    item={qrItem}
                />

                {/* Delete Confirmation Modal */}
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

                {/* Item Detail - extracted to InventoryDetailModal */}
                <InventoryDetailModal
                    item={detailItem}
                    isOpen={!!detailItem}
                    onClose={() => setDetailItem(null)}
                    isStaffPlus={isStaffPlus}
                    getStatusActions={getStatusActions}
                />

                {/* ===== Status Change Modal ===== */}
                <Modal
                    isOpen={statusModal.open}
                    onClose={() => setStatusModal({ open: false, item: null, targetStatus: '' })}
                    title={`Change Status to ${statusModal.targetStatus?.replace('_', ' ')}`}
                    size="sm"
                >
                    <div className="space-y-4 pt-2">
                        {/* Status badge preview */}
                        <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Item:</span>
                            <span className="font-semibold text-sm text-gray-900 dark:text-white">{statusModal.item?.name}</span>
                            <ArrowRight size={14} className="text-gray-400" />
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[statusModal.targetStatus] || 'bg-gray-100 text-gray-700'}`}>
                                {statusModal.targetStatus?.replace('_', ' ')}
                            </span>
                        </div>

                        {/* Reason / Note */}
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

                        {/* Maintenance ETA date picker */}
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

                        {/* Action buttons */}
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
