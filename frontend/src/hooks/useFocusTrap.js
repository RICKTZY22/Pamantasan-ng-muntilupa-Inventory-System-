import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside the returned ref's element while `active`.
 * - On activate: remembers the previously focused element, then focuses the
 *   first focusable inside the container.
 * - Tab / Shift+Tab wrap within the container.
 * - On deactivate/unmount: restores focus to the previously focused element.
 *
 * Usage: const ref = useFocusTrap(isOpen); <div ref={ref}>…</div>
 */
const useFocusTrap = (active) => {
    const containerRef = useRef(null);
    const previouslyFocused = useRef(null);

    useEffect(() => {
        if (!active) return undefined;
        const container = containerRef.current;
        if (!container) return undefined;

        previouslyFocused.current = document.activeElement;

        const getFocusable = () =>
            Array.from(container.querySelectorAll(FOCUSABLE)).filter(
                (el) => el.offsetParent !== null || el === document.activeElement,
            );

        // Focus the first focusable element once the container is mounted.
        const focusables = getFocusable();
        (focusables[0] || container).focus?.();

        const onKeyDown = (e) => {
            if (e.key !== 'Tab') return;
            const items = getFocusable();
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const activeEl = document.activeElement;
            if (e.shiftKey && (activeEl === first || !container.contains(activeEl))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && activeEl === last) {
                e.preventDefault();
                first.focus();
            }
        };

        container.addEventListener('keydown', onKeyDown);
        return () => {
            container.removeEventListener('keydown', onKeyDown);
            previouslyFocused.current?.focus?.();
        };
    }, [active]);

    return containerRef;
};

export default useFocusTrap;
