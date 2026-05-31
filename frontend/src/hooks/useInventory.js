import { useState, useCallback } from 'react';
import { inventoryService } from '../services';
import { formatApiError } from '../utils/errorUtils';
import { ROLE_HIERARCHY } from '../utils/roles';

const useInventory = () => {
    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [stats, setStats] = useState({
        total: 0,
        available: 0,
        inUse: 0,
        maintenance: 0,
        retired: 0,
        categories: 0,
        lowStock: 0,
    });

    const LOW_STOCK_THRESHOLD = 5;

    const clearError = useCallback(() => setError(null), []);

    const fetchInventory = useCallback(async (filters = {}) => {
        setLoading(true);
        setError(null);
        try {
            const data = await inventoryService.getAll(filters);
            const items = Array.isArray(data) ? data : data.results || [];
            setInventory(items);

            // We recompute stats client-side from the fetched items rather than
            // using the separate /stats/ endpoint because it guarantees the
            // stat cards always match what the user sees in the grid below.
            // The /stats/ endpoint exists for the dashboard's overview cards.
            const categories = new Set(items.map(i => i.category));
            setStats({
                total: items.length,
                available: items.filter(i => i.status === 'AVAILABLE').length,
                inUse: items.filter(i => i.status === 'IN_USE').length,
                maintenance: items.filter(i => i.status === 'MAINTENANCE').length,
                retired: items.filter(i => i.status === 'RETIRED').length,
                categories: categories.size,
                lowStock: items.filter(i => i.quantity > 0 && i.quantity <= LOW_STOCK_THRESHOLD).length,
            });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to fetch inventory');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const data = await inventoryService.getStats();
            setStats(data);
        } catch (err) {
            // stats fetch failed — non-critical
        }
    }, []);

    const addItem = useCallback(async (item) => {
        setLoading(true);
        setError(null);
        try {
            const cleanData = { ...item };
            // Only delete imageUrl if it's truly empty (not a File)
            if (cleanData.imageUrl !== undefined && !(cleanData.imageUrl instanceof File)) {
                if (!cleanData.imageUrl) {
                    delete cleanData.imageUrl;
                }
            }
            // Django's PositiveIntegerField chokes on empty strings —
            // send null instead so the field is properly cleared
            if (!cleanData.borrowDuration && cleanData.borrowDuration !== 0) {
                cleanData.borrowDuration = null;
            }
            const newItem = await inventoryService.create(cleanData);
            setInventory(prev => [...prev, newItem]);
            return { success: true, item: newItem, message: 'Item added successfully' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to add item');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const updateItem = useCallback(async (id, data) => {
        setLoading(true);
        setError(null);
        try {
            // Only send writable fields
            const allowedKeys = ['name', 'category', 'quantity', 'status', 'location', 'description', 'imageUrl', 'accessLevel', 'isReturnable', 'priority', 'borrowDuration', 'borrowDurationUnit'];
            const cleanData = {};
            allowedKeys.forEach(key => {
                if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
                    cleanData[key] = data[key];
                }
            });
            // Always include quantity even if 0
            if (data.quantity !== undefined) cleanData.quantity = data.quantity;
            // Always include isReturnable — false is a legit value
            if (data.isReturnable !== undefined) cleanData.isReturnable = data.isReturnable;
            // same empty string → null fix for borrowDuration
            if (!data.borrowDuration && data.borrowDuration !== 0) {
                cleanData.borrowDuration = null;
            }
            const updatedItem = await inventoryService.update(id, cleanData);
            setInventory(prev => prev.map(item =>
                item.id === id ? updatedItem : item
            ));
            return { success: true, message: 'Item updated successfully' };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to update item');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const deleteItem = useCallback(async (id) => {
        setLoading(true);
        setError(null);
        try {
            await inventoryService.delete(id);
            setInventory(prev => prev.filter(item => item.id !== id));
            return { success: true, message: 'Item deleted successfully' };
        } catch (err) {
            const errorMessage = err.response?.data?.detail || 'Failed to delete item';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const getLowStockItems = useCallback(async () => {
        try {
            const data = await inventoryService.getLowStock();
            return Array.isArray(data) ? data : data.results || [];
        } catch (err) {
            return [];
        }
    }, []);

    const changeItemStatus = useCallback(async (id, { status, note, maintenanceEta }) => {
        setLoading(true);
        setError(null);
        try {
            const updatedItem = await inventoryService.changeStatus(id, {
                status,
                note: note || '',
                maintenanceEta: maintenanceEta || null,
            });
            setInventory(prev => prev.map(item =>
                item.id === id ? updatedItem : item
            ));
            return { success: true, message: `Status changed to ${status}` };
        } catch (err) {
            const errorMessage = formatApiError(err, 'Failed to change status');
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    }, []);

    const getAccessibleItems = useCallback((userRole, searchQuery = '') => {
        const userLevel = ROLE_HIERARCHY[userRole] || 1;

        // Client-side filtering — the backend already filters by role in
        // get_queryset(), but this extra check handles the edge case where
        // items were cached before a role change took effect.
        let accessible = inventory.filter(item => {
            const itemLevel = ROLE_HIERARCHY[item.accessLevel] || 1;
            return userLevel >= itemLevel && item.status === 'AVAILABLE' && item.quantity > 0;
        });

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            accessible = accessible.filter(item =>
                item.name.toLowerCase().includes(query) ||
                item.category.toLowerCase().includes(query)
            );
        }

        return accessible;
    }, [inventory]);

    return {
        inventory,
        loading,
        error,
        clearError,
        selectedItem,
        setSelectedItem,
        fetchInventory,
        fetchStats,
        addItem,
        updateItem,
        deleteItem,
        changeItemStatus,
        stats,
        getAccessibleItems,
        getLowStockItems,
        LOW_STOCK_THRESHOLD,
    };
};

export default useInventory;
