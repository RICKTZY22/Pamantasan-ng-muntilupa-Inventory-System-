import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

const MotionDiv = motion.div;

// Windows 11-style setting row card: leading icon square + title/description,
// trailing control / chevron. Supports an expandable variant that reveals
// `children` in a collapsible region.
const SettingCard = ({
    icon: Icon,
    title,
    description,
    control,
    children,
    expandable = false,
    defaultOpen = false,
    to,
    onClick,
    disabled = false,
    wip = false,
    naked = false,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const reduce = useReducedMotion();
    const isNav = !expandable && (to || onClick);
    const interactive = expandable || isNav;

    const leading = (
        <div className="flex items-center gap-3 min-w-0">
            {Icon && (
                <span className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 flex-shrink-0">
                    <Icon size={18} />
                </span>
            )}
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</span>
                    {wip && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Soon
                        </span>
                    )}
                </div>
                {description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
                )}
            </div>
        </div>
    );

    const rowClass = `w-full flex items-center justify-between gap-4 px-4 py-3 text-left ${
        interactive && !disabled ? 'hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors' : ''
    } ${disabled ? 'opacity-60' : ''}`;

    const shell = naked
        ? ''
        : 'rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 overflow-hidden';

    // Expandable row
    if (expandable) {
        return (
            <div className={shell}>
                <button
                    type="button"
                    onClick={() => !disabled && setOpen((o) => !o)}
                    aria-expanded={open}
                    disabled={disabled}
                    className={rowClass}
                >
                    {leading}
                    <CaretDown
                        size={16}
                        className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    />
                </button>
                <AnimatePresence initial={false}>
                    {open && (
                        <MotionDiv
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: reduce ? 0 : 0.2, ease: 'easeOut' }}
                            className="overflow-hidden"
                        >
                            <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/50">{children}</div>
                        </MotionDiv>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    // Navigation row (Link or button) with trailing chevron
    if (isNav) {
        const content = (
            <>
                {leading}
                <CaretRight size={16} className="text-gray-400 flex-shrink-0" />
            </>
        );
        return (
            <div className={shell}>
                {to ? (
                    <Link to={to} className={rowClass}>{content}</Link>
                ) : (
                    <button type="button" onClick={onClick} disabled={disabled} className={rowClass}>{content}</button>
                )}
            </div>
        );
    }

    // Static row with a trailing control
    return (
        <div className={shell}>
            <div className={rowClass}>
                {leading}
                {control && <div className="flex-shrink-0">{control}</div>}
            </div>
        </div>
    );
};

SettingCard.displayName = 'SettingCard';

SettingCard.propTypes = {
    icon: PropTypes.elementType,
    title: PropTypes.node.isRequired,
    description: PropTypes.node,
    control: PropTypes.node,
    children: PropTypes.node,
    expandable: PropTypes.bool,
    defaultOpen: PropTypes.bool,
    to: PropTypes.string,
    onClick: PropTypes.func,
    disabled: PropTypes.bool,
    wip: PropTypes.bool,
    naked: PropTypes.bool,
};

export default SettingCard;
