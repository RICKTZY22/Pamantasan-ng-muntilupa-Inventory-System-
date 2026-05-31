import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { UserCircle, Robot } from '@phosphor-icons/react';

// Resolve relative Django media URLs (e.g. "/media/avatars/x.jpg") to absolute.
const BACKEND_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
const resolveSrc = (src) => (src && src.startsWith('/') ? `${BACKEND_ORIGIN}${src}` : src);

/**
 * Shared avatar. Shows the user's photo when available, otherwise a Phosphor
 * UserCircle placeholder. Pass `gradient` (Tailwind from-/to- classes) for a
 * colored placeholder with a white icon; omit for a neutral gray placeholder.
 */
const Avatar = ({ src, name = '', size = 40, gradient, className = '', ring = false, isAssistant = false }) => {
    const [errored, setErrored] = useState(false);
    const resolved = resolveSrc(src);
    const showImg = resolved && !errored;
    const ringCls = ring ? 'ring-2 ring-white dark:ring-gray-800' : '';
    const box = { width: size, height: size };

    // The PLMun Assistant always renders its own branded icon (ignoring any
    // src/name), so it's instantly recognizable to every role — student,
    // faculty, staff, and admin — wherever it appears in messaging.
    if (isAssistant) {
        return (
            <span
                style={box}
                aria-label="PLMun Assistant"
                className={`inline-flex items-center justify-center rounded-full flex-shrink-0 bg-gradient-to-br from-violet-500 to-indigo-600 text-white ${ringCls} ${className}`}
            >
                <Robot size={Math.round(size * 0.6)} weight="fill" />
            </span>
        );
    }

    if (showImg) {
        return (
            <img
                src={resolved}
                alt={name || 'User'}
                style={box}
                onError={() => setErrored(true)}
                className={`rounded-full object-cover flex-shrink-0 ${ringCls} ${className}`}
            />
        );
    }

    const tint = gradient
        ? `bg-gradient-to-br ${gradient} text-white`
        : 'bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500';

    return (
        <span
            style={box}
            aria-label={name || 'User'}
            className={`inline-flex items-center justify-center rounded-full flex-shrink-0 ${tint} ${ringCls} ${className}`}
        >
            <UserCircle size={Math.round(size * 0.64)} weight="duotone" />
        </span>
    );
};

Avatar.propTypes = {
    src: PropTypes.string,
    name: PropTypes.string,
    size: PropTypes.number,
    gradient: PropTypes.string,
    className: PropTypes.string,
    ring: PropTypes.bool,
    isAssistant: PropTypes.bool,
};

export default Avatar;
