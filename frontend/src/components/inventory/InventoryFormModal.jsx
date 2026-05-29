// form modal for adding/editing inventory items
// NOTE: the select dropdowns don't have dark mode styles yet,
// they look fine-ish but could be better
import React from 'react';
import { Button, Input, Modal, ImageUpload } from '../ui';

const InventoryFormModal = ({
    isOpen,
    onClose,
    onSubmit,
    editingItem,
    formData,
    setFormData,
}) => {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editingItem ? 'Edit Item' : 'Add New Item'}
            description={editingItem ? 'Update the inventory item details' : 'Add a new item to your inventory'}
        >
            <form onSubmit={onSubmit} className="space-y-2.5">
                <Input
                    label="Item Name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter item name"
                />
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Category</label>
                        <select
                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-gray-800 [&>option]:text-gray-900 [&>option]:dark:text-gray-100"
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                            <option value="ELECTRONICS">Electronics</option>
                            <option value="FURNITURE">Furniture</option>
                            <option value="EQUIPMENT">Equipment</option>
                            <option value="SUPPLIES">Supplies</option>
                            <option value="OTHER">Other</option>
                        </select>
                    </div>
                    <Input
                        label="Quantity"
                        type="number"
                        min="1"
                        required
                        value={formData.quantity}
                        onChange={(e) => {
                            const parsed = parseInt(e.target.value) || 1;
                            setFormData({ ...formData, quantity: Math.max(1, parsed) });
                        }}
                    />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Status</label>
                        <select
                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-gray-800 [&>option]:text-gray-900 [&>option]:dark:text-gray-100"
                            value={formData.status}
                            onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        >
                            <option value="AVAILABLE">Available</option>
                            <option value="IN_USE">In Use</option>
                            <option value="MAINTENANCE">Maintenance</option>
                            <option value="RETIRED">Retired</option>
                        </select>
                    </div>
                    <Input
                        label="Location"
                        value={formData.location}
                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                        placeholder="Storage location"
                    />
                </div>
                <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Access Level</label>
                    <select
                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none"
                        value={formData.accessLevel}
                        onChange={(e) => setFormData({ ...formData, accessLevel: e.target.value })}
                    >
                        <option value="STUDENT">Student (Everyone can access)</option>
                        <option value="FACULTY">Faculty (Faculty & above)</option>
                        <option value="STAFF">Staff (Staff & Admin only)</option>
                        <option value="ADMIN">Admin (Admin only)</option>
                    </select>
                    <p className="text-[11px] text-gray-400 ml-1">Controls which roles can see and request this item</p>
                </div>
                <div className="space-y-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Priority Level</label>
                    <select
                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-gray-800 [&>option]:text-gray-900 [&>option]:dark:text-gray-100"
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    >
                        <option value="LOW">🟢 Low — Consumables, basic supplies (ballpens, paper)</option>
                        <option value="MEDIUM">🟡 Medium — Standard equipment (chairs, keyboards)</option>
                        <option value="HIGH">🔴 High — Fragile/expensive items (lab glass, projectors)</option>
                    </select>
                    <p className="text-[11px] text-gray-400 ml-1">Indicates handling care and tracking importance</p>
                </div>
                <ImageUpload
                    value={formData.imageUrl}
                    onChange={(imageUrl) => setFormData({ ...formData, imageUrl })}
                    compact
                />
                <label className="flex items-center gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl cursor-pointer">
                    <input
                        type="checkbox"
                        checked={formData.isReturnable}
                        onChange={(e) => setFormData({ ...formData, isReturnable: e.target.checked, borrowDuration: e.target.checked ? formData.borrowDuration : '' })}
                        className="w-4 h-4 rounded text-primary"
                    />
                    <div>
                        <span className="text-sm font-medium text-gray-700">Returnable Item</span>
                        <p className="text-xs text-gray-500">Borrowers must return this item</p>
                    </div>
                </label>
                {formData.isReturnable && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Borrow Duration</label>
                            <input
                                type="number"
                                min="1"
                                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-gray-800 [&>option]:text-gray-900 [&>option]:dark:text-gray-100"
                                value={formData.borrowDuration}
                                onChange={(e) => setFormData({ ...formData, borrowDuration: parseInt(e.target.value) || '' })}
                                placeholder="e.g. 3"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Unit</label>
                            <select
                                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-primary outline-none appearance-none cursor-pointer [&>option]:bg-white [&>option]:dark:bg-gray-800 [&>option]:text-gray-900 [&>option]:dark:text-gray-100"
                                value={formData.borrowDurationUnit}
                                onChange={(e) => setFormData({ ...formData, borrowDurationUnit: e.target.value })}
                            >
                                <option value="MINUTES">Minutes</option>
                                <option value="HOURS">Hours</option>
                                <option value="DAYS">Days</option>
                                <option value="MONTHS">Months</option>
                            </select>
                        </div>
                    </div>
                )}
                <div className="flex gap-3 pt-3">
                    <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="submit" className="flex-1">
                        {editingItem ? 'Update' : 'Add'} Item
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default InventoryFormModal;
