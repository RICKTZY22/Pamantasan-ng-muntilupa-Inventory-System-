/* Detail modal for inventory items.
   This was the biggest chunk pulled out of Inventory.jsx (~230 lines).
   The access level color logic was a nightmare of nested ternaries
   so I refactored it into lookup objects — much easier to read now. */
import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { MapPin, Package, ArrowCounterClockwise as RotateCcw, Shield, Timer, Clock, CalendarBlank as Calendar, Warning as AlertTriangle, ChatCircle } from '@phosphor-icons/react';
import { Modal } from '../ui';
import { resolveImageUrl } from '../../utils/imageUtils';

const statusColors = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    IN_USE: 'bg-blue-100 text-blue-700',
    MAINTENANCE: 'bg-amber-100 text-amber-700',
    RETIRED: 'bg-gray-100 text-gray-700',
};

const priorityStyles = {
    LOW: { bg: 'bg-green-50 dark:bg-green-900/20', icon: 'bg-green-100 dark:bg-green-800/40', text: 'text-green-600', label: 'text-green-700 dark:text-green-300', desc: 'Consumables & basic supplies' },
    MEDIUM: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'bg-amber-100 dark:bg-amber-800/40', text: 'text-amber-600', label: 'text-amber-700 dark:text-amber-300', desc: 'Standard equipment' },
    HIGH: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'bg-red-100 dark:bg-red-800/40', text: 'text-red-600', label: 'text-red-700 dark:text-red-300', desc: 'Fragile or expensive' },
};

const categoryIcons = {
    ELECTRONICS: '💻',
    FURNITURE: '🪑',
    EQUIPMENT: '🔧',
    SUPPLIES: '📦',
    OTHER: '📋',
};

const InventoryDetailModal = ({
    item,
    isOpen,
    onClose,
    isStaffPlus,
    getStatusActions,
}) => {
    const navigate = useNavigate();
    if (!item) return null;

    // Open the PLMun Assistant thread with this item attached so the user can
    // ask about it (brand, specs, availability, etc.).
    const referInChat = () => {
        onClose();
        navigate('/messages', {
            state: { askAssistantItem: { id: item.id, name: item.name, brand: item.brand, category: item.category, quantity: item.quantity } },
        });
    };

    // Helper to pick color based on access level — avoids repeating the
    // same ternary chain inline (which was getting unreadable in the original).
    const accessColors = {
        STUDENT: { bg: 'bg-blue-50 dark:bg-blue-900/20', icon: 'bg-blue-100 dark:bg-blue-800/40', text: 'text-blue-600', label: 'text-blue-700 dark:text-blue-300' },
        FACULTY: { bg: 'bg-violet-50 dark:bg-violet-900/20', icon: 'bg-violet-100 dark:bg-violet-800/40', text: 'text-violet-600', label: 'text-violet-700 dark:text-violet-300' },
        STAFF: { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'bg-amber-100 dark:bg-amber-800/40', text: 'text-amber-600', label: 'text-amber-700 dark:text-amber-300' },
        ADMIN: { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'bg-red-100 dark:bg-red-800/40', text: 'text-red-600', label: 'text-red-700 dark:text-red-300' },
    };

    const ac = accessColors[item.accessLevel] || accessColors.STUDENT;

    // Quantity color lookup — using full class strings so Tailwind JIT can detect them
    const qtyLow = item.quantity <= 5 && item.quantity > 0;
    const qtyOut = item.quantity === 0;
    const qtyStyles = qtyOut
        ? { bg: 'bg-red-50 dark:bg-red-900/20', icon: 'bg-red-100 dark:bg-red-800/40', text: 'text-red-600 dark:text-red-400' }
        : qtyLow
            ? { bg: 'bg-amber-50 dark:bg-amber-900/20', icon: 'bg-amber-100 dark:bg-amber-800/40', text: 'text-amber-600 dark:text-amber-400' }
            : { bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: 'bg-emerald-100 dark:bg-emerald-800/40', text: 'text-emerald-600 dark:text-emerald-400' };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Item Details" size="md">
            <div className="space-y-4" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
                {/* Image / Icon Header */}
                <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800">
                    {item.imageUrl ? (
                        <img
                            src={resolveImageUrl(item.imageUrl)}
                            alt={item.name}
                            className="w-full h-48 object-cover"
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    ) : (
                        <div className="w-full h-36 flex items-center justify-center">
                            <span className="text-6xl">{categoryIcons[item.category] || '📋'}</span>
                        </div>
                    )}
                    <div className="absolute top-3 right-3">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-lg ${statusColors[item.status]}`}>
                            {item.status}
                        </span>
                    </div>
                </div>

                {/* Name + Category */}
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">{item.name}</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-1">
                        <span>{categoryIcons[item.category] || '📋'}</span>
                        {item.category}
                        {item.brand && <span className="text-gray-400">· {item.brand}</span>}
                    </p>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                    {/* Location */}
                    <div className="flex items-center gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-800/40 flex items-center justify-center">
                            <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Location</p>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                                {item.location || 'Not specified'}
                            </p>
                        </div>
                    </div>

                    {/* Quantity */}
                    <div className={`flex items-center gap-2.5 p-3 rounded-xl ${qtyStyles.bg}`}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${qtyStyles.icon}`}>
                            <Package size={18} className={qtyStyles.text} />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Quantity</p>
                            <div className="flex items-center gap-1.5">
                                <p className={`text-sm font-bold ${item.quantity <= 5 ? 'text-red-600' : 'text-gray-800 dark:text-gray-100'}`}>{item.quantity}</p>
                                {qtyLow && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded font-bold">LOW</span>
                                )}
                                {qtyOut && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-red-200 text-red-800 rounded font-bold">OUT</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Returnable */}
                    <div className={`flex items-center gap-2.5 p-3 rounded-xl ${item.isReturnable ? 'bg-purple-50 dark:bg-purple-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${item.isReturnable ? 'bg-purple-100 dark:bg-purple-800/40' : 'bg-gray-200 dark:bg-gray-700'}`}>
                            <RotateCcw size={18} className={item.isReturnable ? 'text-purple-600' : 'text-gray-400'} />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Returnable</p>
                            <p className={`text-sm font-semibold ${item.isReturnable ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500'}`}>
                                {item.isReturnable ? 'Yes' : 'No'}
                            </p>
                        </div>
                    </div>

                    {/* Access Level */}
                    <div className={`flex items-center gap-2.5 p-3 rounded-xl ${ac.bg}`}>
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${ac.icon}`}>
                            <Shield size={18} className={ac.text} />
                        </div>
                        <div>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Access Level</p>
                            <p className={`text-sm font-semibold ${ac.label}`}>
                                {item.accessLevel || 'STUDENT'}+
                            </p>
                        </div>
                    </div>

                    {/* Priority */}
                    {(() => {
                        const pri = priorityStyles[item.priority] || priorityStyles.MEDIUM;
                        return (
                            <div className={`flex items-center gap-2.5 p-3 rounded-xl ${pri.bg}`}>
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${pri.icon}`}>
                                    <AlertTriangle size={18} className={pri.text} />
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Priority</p>
                                    <p className={`text-sm font-semibold ${pri.label}`}>
                                        {item.priority || 'MEDIUM'}
                                    </p>
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{pri.desc}</p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Borrow Duration */}
                    {item.isReturnable && item.borrowDuration && (
                        <div className="flex items-center gap-2.5 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl">
                            <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-800/40 flex items-center justify-center">
                                <Timer size={18} className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold">Borrow Limit</p>
                                <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                                    {item.borrowDuration} {item.borrowDurationUnit?.toLowerCase()}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Description */}
                {item.description && (
                    <div className="p-3 bg-gradient-to-br from-gray-50 to-gray-100/50 dark:from-gray-800 dark:to-gray-700/50 rounded-xl">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold mb-1">Description</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            {item.description}
                        </p>
                    </div>
                )}

                {/* Status History / Metadata */}
                {(item.statusNote || item.statusChangedAt || item.maintenanceEta) && (
                    <div className="p-3 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-700/30 rounded-xl space-y-2 border border-slate-200 dark:border-slate-700/50">
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold flex items-center gap-1">
                            <Clock size={10} /> Status History
                        </p>
                        {item.statusNote && (
                            <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                                "{item.statusNote}"
                            </p>
                        )}
                        {item.statusChangedByName && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Changed by <span className="font-semibold text-gray-700 dark:text-gray-300">{item.statusChangedByName}</span>
                                {item.statusChangedAt && (
                                    <> on {new Date(item.statusChangedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</>
                                )}
                            </p>
                        )}
                        {item.maintenanceEta && item.status === 'MAINTENANCE' && (
                            <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                                <Calendar size={14} className="text-amber-600" />
                                <div>
                                    <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold uppercase">Expected Back</p>
                                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                                        {new Date(item.maintenanceEta).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        {new Date(item.maintenanceEta) > new Date() && (
                                            <span className="ml-1 text-xs font-normal text-amber-500">
                                                ({Math.ceil((new Date(item.maintenanceEta) - new Date()) / (1000 * 60 * 60 * 24))} days left)
                                            </span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Quick Actions for staff+ */}
                {isStaffPlus && item.status !== 'AVAILABLE' && (
                    <div className="flex gap-2">
                        {getStatusActions(item).map((action, idx) => {
                            const ActionIcon = action.icon;
                            return (
                                <button
                                    key={idx}
                                    onClick={(e) => { action.onClick(e); onClose(); }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${action.color} bg-opacity-10`}
                                    style={{ backgroundColor: 'var(--tw-bg-opacity, 0.05)' }}
                                >
                                    <ActionIcon size={16} />
                                    {action.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Refer to chat + Close */}
                <div className="flex gap-2">
                    <button
                        onClick={referInChat}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-accent text-white font-semibold text-sm hover:bg-accent/90 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <ChatCircle size={16} weight="duotone" />
                        Ask about this item
                    </button>
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
};

InventoryDetailModal.propTypes = {
    item: PropTypes.shape({
        accessLevel: PropTypes.string,
        quantity: PropTypes.number,
        imageUrl: PropTypes.string,
        name: PropTypes.string,
        brand: PropTypes.string,
        category: PropTypes.string,
        status: PropTypes.string,
        location: PropTypes.string,
        isReturnable: PropTypes.bool,
        borrowDuration: PropTypes.number,
        borrowDurationUnit: PropTypes.string,
        description: PropTypes.string,
        priority: PropTypes.string,
        statusNote: PropTypes.string,
        statusChangedAt: PropTypes.string,
        statusChangedByName: PropTypes.string,
        maintenanceEta: PropTypes.string,
    }),
    isOpen: PropTypes.bool,
    onClose: PropTypes.func,
    isStaffPlus: PropTypes.bool,
    getStatusActions: PropTypes.func,
};

export default InventoryDetailModal;
