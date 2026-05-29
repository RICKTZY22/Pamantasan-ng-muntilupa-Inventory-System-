import React from 'react';

// mga variant at sizes ng button
// HACK: yung gradient variant parang off ang colors sa dark mode, ayusin mamaya

const variants = {
    primary: 'bg-accent text-white hover:bg-accent-dark shadow-sm hover:shadow-md',
    secondary: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600',
    outline: 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800',
    ghost: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
    danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
    gradient: 'bg-gradient-to-r from-accent to-accent-light text-white shadow-sm',
};

const sizes = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-sm',
    xl: 'px-6 py-3 text-base',
};

// Icon size lookup — avoids nested ternaries (SonarCloud: cognitive complexity)
const iconSizes = { xs: 12, sm: 14, md: 16, lg: 18, xl: 18 };

const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    loading = false,
    icon: Icon,
    iconPosition = 'left',
    fullWidth = false,
    ...props
}) => {
    const iconSize = iconSizes[size] || 16;

    return (
        <button
            disabled={disabled || loading}
            className={`
                inline-flex items-center justify-center gap-1.5
                font-medium rounded-lg
                transition-all duration-150 ease-out
                disabled:opacity-50 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-1
                ${variants[variant]}
                ${sizes[size]}
                ${fullWidth ? 'w-full' : ''}
                ${className}
            `}
            {...props}
        >
            {loading ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : Icon && iconPosition === 'left' ? (
                <Icon size={iconSize} />
            ) : null}

            <span>{children}</span>

            {!loading && Icon && iconPosition === 'right' && (
                <Icon size={iconSize} />
            )}
        </button>
    );
};

export default Button;
