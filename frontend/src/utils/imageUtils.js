/**
 * Shared image utilities for resolving backend media URLs.
 */

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:8000';

/**
 * Convert a potentially relative image URL from Django into a full absolute URL.
 * Returns the original value unchanged if it is already absolute or falsy.
 */
export const resolveImageUrl = (url) => {
    if (!url) return url;
    if (url.startsWith('http')) return url;
    return `${BACKEND_URL}${url}`;
};
