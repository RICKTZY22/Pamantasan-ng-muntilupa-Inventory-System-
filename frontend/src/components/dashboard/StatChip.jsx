import React from 'react';
import PropTypes from 'prop-types';

const TONES = {
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400',
    gray: 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400',
};

// Compact horizontal stat: tinted icon circle + big number + label.
const StatChip = ({ icon: Icon, value, label, tone = 'emerald', hint, onClick }) => {
    const interactive = typeof onClick === 'function';
    const Wrapper = interactive ? 'button' : 'div';
    return (
        <Wrapper
            type={interactive ? 'button' : undefined}
            onClick={onClick}
            className={`flex items-center gap-3.5 w-full text-left bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-card p-4 ${interactive ? 'hover:shadow-card-hover hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200' : ''}`}
        >
            <span className={`flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0 ${TONES[tone] || TONES.emerald}`}>
                {Icon && <Icon size={22} weight="duotone" />}
            </span>
            <span className="min-w-0">
                <span className="block text-2xl font-bold text-gray-900 dark:text-white leading-tight tabular-nums">{value}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{label}</span>
                {hint && <span className="block text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{hint}</span>}
            </span>
        </Wrapper>
    );
};

StatChip.propTypes = {
    icon: PropTypes.elementType,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    label: PropTypes.string,
    tone: PropTypes.oneOf(['emerald', 'amber', 'blue', 'red', 'violet', 'gray']),
    hint: PropTypes.string,
    onClick: PropTypes.func,
};

export default StatChip;
