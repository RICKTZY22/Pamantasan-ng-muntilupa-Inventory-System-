import React from 'react';
import PropTypes from 'prop-types';
import { Clock, Warning } from '@phosphor-icons/react';
import { Card } from '../ui';

const TONES = {
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
};

// Right-rail "schedule" widget: a titled card listing time-sensitive items
// (due-soon / overdue borrows for staff, active borrows for students).
const ScheduleRail = ({ title, icon: Icon, items, emptyMessage = 'Nothing scheduled' }) => (
    <Card>
        <Card.Header>
            <Card.Title className="flex items-center gap-2">
                {Icon && <Icon size={18} weight="duotone" className="text-emerald-500" />}
                {title}
            </Card.Title>
        </Card.Header>
        <Card.Content>
            {items.length === 0 ? (
                <div className="text-center py-6">
                    <Clock size={32} weight="duotone" className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {items.map((it) => {
                        const ItemIcon = it.tone === 'red' ? Warning : Clock;
                        return (
                            <div
                                key={it.id}
                                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50"
                            >
                                <span className={`flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 ${TONES[it.tone] || TONES.amber}`}>
                                    <ItemIcon size={18} weight="duotone" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{it.primary}</p>
                                    {it.secondary && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{it.secondary}</p>}
                                </div>
                                {it.right && <div className="flex-shrink-0">{it.right}</div>}
                            </div>
                        );
                    })}
                </div>
            )}
        </Card.Content>
    </Card>
);

ScheduleRail.propTypes = {
    title: PropTypes.string,
    icon: PropTypes.elementType,
    emptyMessage: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        primary: PropTypes.string,
        secondary: PropTypes.string,
        tone: PropTypes.oneOf(['emerald', 'amber', 'red', 'blue']),
        right: PropTypes.node,
    })).isRequired,
};

export default ScheduleRail;
