import React from 'react';
import PropTypes from 'prop-types';
import { TrendUp as TrendingUp, TrendDown as TrendingDown, Minus } from '@phosphor-icons/react';

const StatCard = ({
    title,
    value,
    icon: Icon,
    trend,
    trendValue,
    color = 'primary'
}) => {
    const iconColors = {
        primary: 'bg-accent/10 text-accent dark:bg-accent/20',
        secondary: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
        success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
        warning: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
        danger: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    };

    const getTrendIcon = () => {
        if (trend === 'up') return <TrendingUp size={12} />;
        if (trend === 'down') return <TrendingDown size={12} />;
        return <Minus size={12} />;
    };

    const getTrendColor = () => {
        if (trend === 'up') return 'text-emerald-600 dark:text-emerald-400';
        if (trend === 'down') return 'text-red-500 dark:text-red-400';
        return 'text-gray-500';
    };

    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700/50 p-4 shadow-card hover:shadow-card-hover transition-shadow">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{title}</p>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</h3>
                    {trendValue && (
                        <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${getTrendColor()}`}>
                            {getTrendIcon()}
                            <span>{trendValue}</span>
                        </div>
                    )}
                </div>
                {Icon && (
                    <div className={`p-2.5 rounded-lg ${iconColors[color]}`}>
                        <Icon size={20} />
                    </div>
                )}
            </div>
        </div>
    );
};

StatCard.propTypes = {
    title: PropTypes.string,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    icon: PropTypes.elementType,
    trend: PropTypes.oneOf(['up', 'down', 'neutral']),
    trendValue: PropTypes.string,
    color: PropTypes.string,
};

export default StatCard;
