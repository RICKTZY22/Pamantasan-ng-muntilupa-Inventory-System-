import { useState, useEffect } from 'react';

const useMediaQuery = (query) => {
    const [matches, setMatches] = useState(false);

    useEffect(() => {
        const media = window.matchMedia(query);
        setMatches(media.matches);

        const listener = (e) => setMatches(e.matches);
        media.addEventListener('change', listener);

        return () => media.removeEventListener('change', listener);
    }, [query]);

    return matches;
};

// Breakpoint shortcut (only the mobile breakpoint is used across the app).
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

export default useMediaQuery;
