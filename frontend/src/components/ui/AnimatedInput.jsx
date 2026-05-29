import React, { useState } from 'react';

/**
 * Text input with a subtle lift-on-focus animation,
 * coloured icon, ring glow, and a bottom highlight bar.
 */
const AnimatedInput = ({
    icon,
    type = 'text',
    placeholder,
    value,
    onChange,
    disabled = false,
    required = false,
    rightSlot,
    borderClass,
    ...rest
}) => {
    const [focused, setFocused] = useState(false);

    const defaultBorder = focused
        ? 'border-primary ring-2 ring-primary/20 shadow-sm shadow-primary/10'
        : 'border-gray-200 dark:border-gray-600';

    return (
        <div className={`relative transition-transform duration-200 ${focused ? '-translate-y-0.5' : ''}`}>
            {React.createElement(icon, {
                size: 17,
                className: `absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused ? 'text-primary' : 'text-gray-400'}`,
            })}
            <input
                type={type}
                disabled={disabled}
                required={required}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                className={`w-full pl-10 ${rightSlot ? 'pr-10' : 'pr-4'} py-3 bg-gray-50 dark:bg-gray-700/50 border rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${borderClass || defaultBorder}`}
                {...rest}
            />
            {rightSlot && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightSlot}</div>}
            {focused && (
                <div className="absolute bottom-0 left-[10%] right-[10%] h-0.5 bg-primary rounded-full animate-input-highlight" />
            )}
        </div>
    );
};

export default AnimatedInput;
