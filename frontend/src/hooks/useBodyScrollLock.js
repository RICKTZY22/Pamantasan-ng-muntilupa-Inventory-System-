import { useEffect } from 'react';

/**
 * Locks `document.body` scrolling while `locked` is true, restoring the prior
 * value on unlock/unmount. Mirrors the inline effect previously in Modal.
 */
const useBodyScrollLock = (locked) => {
    useEffect(() => {
        if (!locked) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous || 'unset';
        };
    }, [locked]);
};

export default useBodyScrollLock;
