import React from 'react';
import PropTypes from 'prop-types';

// Accessible switch (WAI-ARIA switch pattern). Windows 11-style pill toggle.
// onChange is called with the NEXT boolean value.
const SIZES = {
    sm: { track: 'w-9 h-5', knob: 'w-4 h-4', on: 'translate-x-4' },
    md: { track: 'w-11 h-6', knob: 'w-5 h-5', on: 'translate-x-5' },
};

const Toggle = ({ checked, onChange, disabled = false, size = 'md', id, 'aria-label': ariaLabel }) => {
    const s = SIZES[size] || SIZES.md;
    return (
        <button
            type="button"
            role="switch"
            id={id}
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(!checked)}
            className={`relative inline-flex items-center flex-shrink-0 rounded-full transition-colors duration-200
                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1
                dark:focus-visible:ring-offset-gray-900
                ${s.track}
                ${checked ? 'bg-accent' : 'bg-gray-300 dark:bg-gray-600'}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`inline-block ${s.knob} bg-white rounded-full shadow transform transition-transform duration-200 ml-0.5
                    ${checked ? s.on : 'translate-x-0'}`}
            />
        </button>
    );
};

Toggle.propTypes = {
    checked: PropTypes.bool,
    onChange: PropTypes.func,
    disabled: PropTypes.bool,
    size: PropTypes.oneOf(['sm', 'md']),
    id: PropTypes.string,
    'aria-label': PropTypes.string,
};

export default Toggle;
