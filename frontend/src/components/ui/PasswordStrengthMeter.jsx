import React from 'react';
import PropTypes from 'prop-types';

// 0–4 score: length>=8, has upper+lower, has digit, has symbol.
const getPasswordScore = (password = '') => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
};

const LEVELS = [
    { label: '', bar: '' },
    { label: 'Weak', bar: 'bg-red-500' },
    { label: 'Fair', bar: 'bg-amber-500' },
    { label: 'Good', bar: 'bg-blue-500' },
    { label: 'Strong', bar: 'bg-emerald-500' },
];

// Advisory strength indicator. The real minimum (>= 6 chars) is enforced at submit.
const PasswordStrengthMeter = ({ password }) => {
    if (!password) return null;
    const score = getPasswordScore(password);
    const level = LEVELS[score] || LEVELS[1];
    return (
        <div className="mt-2">
            <div className="flex gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                            i <= score ? level.bar : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                    />
                ))}
            </div>
            {level.label && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Password strength: <span className="font-medium">{level.label}</span>
                </p>
            )}
        </div>
    );
};

PasswordStrengthMeter.propTypes = {
    password: PropTypes.string,
};

export default PasswordStrengthMeter;
