import React from 'react';
import { Star, Eye, MapPin, ArrowRight, PencilSimple as Edit, Trash as Trash2, QrCode, FileText, Warning as AlertTriangle, XCircle } from '@phosphor-icons/react';
import { Button, Card } from '../ui';
import { StaffOnly } from '../auth';
import { resolveImageUrl } from '../../utils/imageUtils';

const statusColors = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    IN_USE: 'bg-blue-100 text-blue-700',
    MAINTENANCE: 'bg-amber-100 text-amber-700',
    RETIRED: 'bg-gray-100 text-gray-700',
};

const priorityConfig = {
    LOW: { label: 'Low', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: '🟢' },
    MEDIUM: { label: 'Medium', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: '🟡' },
    HIGH: { label: 'High', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: '🔴' },
};

const categoryIcons = {
    ELECTRONICS: '💻',
    FURNITURE: '🪑',
    EQUIPMENT: '🔧',
    SUPPLIES: '📦',
    OTHER: '📋',
};

const accessLevelColors = {
    STUDENT: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    FACULTY: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    STAFF: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    ADMIN: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const InventoryItemCard = ({
    item,
    showImages,
    isFavorite,
    isStaffPlus,
    onToggleFavorite,
    onViewDetail,
    onRequestItem,
    onEdit,
    onDelete,
    onQrCode,
    getStatusActions,
}) => {
    return (
        <Card
            className={`relative overflow-hidden p-0 hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer group/card ${item.status === 'RETIRED' ? 'opacity-60 grayscale-[30%]' : ''}`}
            onClick={() => onViewDetail(item)}
        >
            {showImages && (
                <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center relative overflow-hidden">
                    {item.imageUrl ? (
                        <img src={resolveImageUrl(item.imageUrl)} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-110" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                        <span className="text-4xl transition-transform duration-300 group-hover/card:scale-110">{categoryIcons[item.category] || '📋'}</span>
                    )}
                    <div className="absolute inset-0 bg-primary/0 group-hover/card:bg-primary/10 transition-colors duration-300 flex items-center justify-center">
                        <Eye size={24} className="text-white opacity-0 group-hover/card:opacity-80 transition-all duration-300 drop-shadow-lg" />
                    </div>
                </div>
            )}
            <div className="p-4 space-y-3">
                <div>
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate group-hover/card:text-primary transition-colors duration-200">{item.name}</h3>
                        <button onClick={(e) => onToggleFavorite(e, item.id)} className={`flex-shrink-0 p-1 rounded-full transition-colors ${isFavorite ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600 hover:text-amber-400'}`} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            {categoryIcons[item.category] || '📋'} {item.category}
                        </p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${accessLevelColors[item.accessLevel] || accessLevelColors.STUDENT}`}>
                            {item.accessLevel || 'STUDENT'}+
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                            {item.status}
                        </span>
                        {item.priority && item.priority !== 'MEDIUM' && (
                            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${priorityConfig[item.priority]?.color || ''}`}>
                                {priorityConfig[item.priority]?.icon} {priorityConfig[item.priority]?.label}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold ${item.quantity <= 5 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            Qty: {item.quantity}
                        </span>
                        {item.quantity <= 5 && item.quantity > 0 && <AlertTriangle size={14} className="text-amber-500" />}
                        {item.quantity === 0 && <XCircle size={14} className="text-red-500" />}
                    </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate flex items-center gap-1">
                    <MapPin size={12} />
                    {item.location || 'No location'}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-primary/60 group-hover/card:text-primary transition-colors duration-200 pt-1">
                    <span>View Details</span>
                    <ArrowRight size={12} className="transition-transform duration-200 group-hover/card:translate-x-1" />
                </div>
                <div className="flex gap-1 pt-2 border-t border-gray-100 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
                    {item.status === 'AVAILABLE' && item.quantity > 0 && (
                        <Button variant="ghost" size="sm" onClick={(e) => onRequestItem(item, e)} title="Request This Item" className="flex-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:scale-105 transition-transform">
                            <FileText size={14} className="mr-1" />
                            {!isStaffPlus && <span className="text-xs">Request</span>}
                        </Button>
                    )}
                    {item.status !== 'AVAILABLE' && item.quantity > 0 && (
                        <span className="flex-1 flex items-center justify-center text-[10px] text-gray-400 dark:text-gray-500 italic">
                            {item.status === 'IN_USE' ? '🔵 In Use' : item.status === 'MAINTENANCE' ? '🟡 Maintenance' : item.status === 'RETIRED' ? '⚫ Retired' : ''}
                        </span>
                    )}
                    <StaffOnly>
                        {getStatusActions(item).map((action) => {
                            const ActionIcon = action.icon;
                            return (
                                <Button key={action.label} variant="ghost" size="sm" onClick={action.onClick} title={action.label} className={`flex-1 hover:scale-105 transition-transform ${action.color}`}>
                                    <ActionIcon size={14} />
                                </Button>
                            );
                        })}
                        <Button variant="ghost" size="sm" onClick={() => onQrCode(item)} title="QR Code" className="flex-1 hover:scale-105 transition-transform"><QrCode size={14} className="text-primary" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => onEdit(item)} title="Edit" className="flex-1 hover:scale-105 transition-transform"><Edit size={14} /></Button>
                        <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} title="Delete" className="flex-1 hover:scale-105 transition-transform"><Trash2 size={14} className="text-red-500" /></Button>
                    </StaffOnly>
                </div>
            </div>
        </Card>
    );
};

export default InventoryItemCard;
