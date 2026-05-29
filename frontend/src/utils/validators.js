// Lightweight client-side validators. Server remains the source of truth.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmail = (email = '') => EMAIL_RE.test(email.trim());

// PLMun accounts use the institutional domain.
export const isPlmunEmail = (email = '') =>
    isValidEmail(email) && email.trim().toLowerCase().endsWith('@plmun.edu.ph');
