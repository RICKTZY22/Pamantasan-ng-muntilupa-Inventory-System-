import React, { useState } from 'react';
import { Eye, EyeSlash as EyeOff } from '@phosphor-icons/react';

const Input = ({
    label,
    error,
    icon: Icon,
    className = '',
    type = 'text',
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const isPassword = type === 'password';
    const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

    return (
        <div className="space-y-1">
            {label && (
                <label className={`
                    block text-xs font-medium
                    transition-colors duration-150
                    ${isFocused ? 'text-accent' : 'text-gray-500 dark:text-gray-400'}
                `}>
                    {label}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <div className={`
                        absolute left-3 top-1/2 -translate-y-1/2
                        transition-colors duration-150
                        ${isFocused ? 'text-accent' : 'text-gray-400 dark:text-gray-500'}
                    `}>
                        <Icon size={16} />
                    </div>
                )}
                <input
                    type={inputType}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className={`
                        w-full px-3 py-2
                        ${Icon ? 'pl-9' : ''}
                        ${isPassword ? 'pr-9' : ''}
                        bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg
                        text-gray-900 dark:text-gray-100 text-sm
                        placeholder:text-gray-400 dark:placeholder:text-gray-500
                        transition-all duration-150
                        focus:border-accent focus:ring-2 focus:ring-accent/15
                        hover:border-gray-400 dark:hover:border-gray-500
                        outline-none
                        ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/15' : ''}
                        ${className}
                    `}
                    {...props}
                />

                {isPassword && (
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={`
                            absolute right-2.5 top-1/2 -translate-y-1/2
                            p-0.5 rounded
                            transition-colors duration-150
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            ${isFocused ? 'text-accent' : 'text-gray-400'}
                        `}
                    >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                )}
            </div>

            {error && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                    <span className="inline-block w-1 h-1 bg-red-500 rounded-full" />
                    {error}
                </p>
            )}
        </div>
    );
};

export default Input;
