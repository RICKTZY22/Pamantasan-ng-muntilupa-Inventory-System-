import React from 'react';
import PropTypes from 'prop-types';
import { Card } from '../ui';

const BAR_COLORS = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    violet: 'bg-violet-500',
    gray: 'bg-gray-400',
};

// Panel of labeled horizontal progress bars. Percentages are relative to the
// sum of all item values (or an explicit `total`).
const StatusBars = ({ title, items, total }) => {
    const sum = total ?? items.reduce((acc, it) => acc + (it.value || 0), 0);
    return (
        <Card>
            {title && <Card.Header><Card.Title>{title}</Card.Title></Card.Header>}
            <Card.Content>
                <div className="space-y-4">
                    {items.map((it) => {
                        const pct = sum > 0 ? Math.round(((it.value || 0) / sum) * 100) : 0;
                        return (
                            <div key={it.label}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">{it.label}</span>
                                    <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                                        {it.value}
                                        <span className="text-xs font-normal text-gray-400 dark:text-gray-500 ml-1">({pct}%)</span>
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700/50 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${BAR_COLORS[it.color] || BAR_COLORS.emerald} transition-[width] duration-500 ease-out`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card.Content>
        </Card>
    );
};

StatusBars.propTypes = {
    title: PropTypes.string,
    total: PropTypes.number,
    items: PropTypes.arrayOf(PropTypes.shape({
        label: PropTypes.string.isRequired,
        value: PropTypes.number,
        color: PropTypes.oneOf(['emerald', 'amber', 'red', 'blue', 'violet', 'gray']),
    })).isRequired,
};

export default StatusBars;
