import React from 'react';

const Card = ({ children, className = '', padding = true, ...props }) => {
    return (
        <div
            className={`
                bg-white dark:bg-gray-800/50
                rounded-xl border border-gray-200 dark:border-gray-700/50
                shadow-card
                transition-shadow duration-200
                ${padding ? 'p-5' : ''}
                ${className}
            `}
            {...props}
        >
            {children}
        </div>
    );
};

const CardHeader = ({ children, className = '' }) => (
    <div className={`flex items-center justify-between mb-3 ${className}`}>
        {children}
    </div>
);

const CardTitle = ({ children, className = '' }) => (
    <h3 className={`text-base font-semibold text-gray-900 dark:text-gray-100 ${className}`}>
        {children}
    </h3>
);

const CardDescription = ({ children, className = '' }) => (
    <p className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        {children}
    </p>
);

const CardContent = ({ children, className = '' }) => (
    <div className={className}>
        {children}
    </div>
);

const CardFooter = ({ children, className = '' }) => (
    <div className={`mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50 ${className}`}>
        {children}
    </div>
);

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Description = CardDescription;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;
