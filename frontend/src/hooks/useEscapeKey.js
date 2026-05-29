import { useEffect, useRef } from 'react';

/**
 * Calls `handler` when the Escape key is pressed, while `active` is true.
 * The handler is kept in a ref so the listener never goes stale and we only
 * re-bind when `active` flips.
 */
const useEscapeKey = (handler, active = true) => {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        if (!active) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') handlerRef.current?.(e);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [active]);
};

export default useEscapeKey;
