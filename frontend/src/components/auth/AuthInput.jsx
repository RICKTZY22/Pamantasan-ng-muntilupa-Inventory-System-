import React from 'react';

/**
 * Minimal, professional text input for the auth pages: real <label>,
 * quiet borders, brand-green focus ring. No lift/glow animations.
 */
const AuthInput = ({
    id,
    label,
    icon: Icon,
    rightSlot,
    hint,
    invalid = false,
    valid = false,
    className = '',
    ...rest
}) => {
    const stateBorder = invalid
        ? 'border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500/15'
        : valid
            ? 'border-plmun-light dark:border-plmun-light focus:border-plmun focus:ring-plmun/15'
            : 'border-gray-300 dark:border-gray-600 focus:border-plmun focus:ring-plmun/15';

    return (
        <div className={className}>
            <label htmlFor={id} className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                {label}
            </label>
            <div className="relative">
                {Icon && (
                    <Icon
                        size={17}
                        aria-hidden="true"
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                    />
                )}
                <input
                    id={id}
                    className={`w-full ${Icon ? 'pl-10' : 'pl-4'} ${rightSlot ? 'pr-11' : 'pr-4'} py-2.5 rounded-lg border bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${stateBorder}`}
                    {...rest}
                />
                {rightSlot && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {rightSlot}
                    </div>
                )}
            </div>
            {hint && <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
        </div>
    );
};

export default AuthInput;
