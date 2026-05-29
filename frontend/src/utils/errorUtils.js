/**
 * Extract a user-friendly error message from an Axios/DRF error response.
 *
 * Priority:
 *   1. error.response.data.detail  (DRF standard single message)
 *   2. error.response.data.error   (custom single message)
 *   3. Flattened field-level validation errors ("field: message, …")
 *   4. The provided fallback string
 *
 * Raw err.message and JSON.stringify are intentionally avoided to prevent
 * leaking internal details (stack traces, server paths, etc.) to the UI.
 */
export const formatApiError = (error, fallback = 'Something went wrong') => {
    const data = error?.response?.data;
    if (!data) return fallback;

    // Single detail string (DRF default)
    if (typeof data.detail === 'string') return data.detail;

    // Custom error key
    if (typeof data.error === 'string') return data.error;

    // Field-level validation errors  { field: ["msg", …], … }
    if (typeof data === 'object' && !Array.isArray(data)) {
        const messages = Object.entries(data)
            .map(([field, msgs]) => {
                const text = Array.isArray(msgs) ? msgs.join(', ') : String(msgs);
                return `${field}: ${text}`;
            })
            .filter(Boolean);
        if (messages.length) return messages.join('. ');
    }

    return fallback;
};
