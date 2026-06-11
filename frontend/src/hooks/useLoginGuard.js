import { useEffect, useRef, useState } from 'react';

/**
 * Client-side brute-force guard for the login form.
 * 5 failed attempts trigger an escalating lockout (30s → 1h) that persists
 * across reloads via sessionStorage. Extracted unchanged from Login.jsx so
 * the page component stays presentational.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIERS = [30_000, 60_000, 300_000, 1_800_000, 3_600_000];
const SESSION_KEY = 'plmun_login_guard';

const readGuard = () => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}'); }
    catch { return {}; }
};
const writeGuard = (obj) => sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
const clearGuard = () => sessionStorage.removeItem(SESSION_KEY);

const tierLabel = (ms) =>
    ms >= 3_600_000 ? `${ms / 3_600_000}-hour`
        : ms >= 60_000 ? `${ms / 60_000}-minute`
            : `${ms / 1_000}-second`;

const useLoginGuard = () => {
    const [attempts, setAttempts] = useState(() => readGuard().attempts || 0);
    const [lockedUntil, setLockedUntil] = useState(() => readGuard().lockedUntil || null);
    const [offenses, setOffenses] = useState(() => readGuard().offenses || 0);
    const [countdown, setCountdown] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        writeGuard({ attempts, lockedUntil, offenses });
    }, [attempts, lockedUntil, offenses]);

    useEffect(() => {
        if (!lockedUntil) { setCountdown(0); return; }
        const tick = () => {
            const left = Math.ceil((lockedUntil - Date.now()) / 1000);
            if (left <= 0) {
                setLockedUntil(null);
                setAttempts(0);
                setCountdown(0);
                writeGuard({ attempts: 0, lockedUntil: null, offenses });
            } else {
                setCountdown(left);
            }
        };
        tick();
        timerRef.current = setInterval(tick, 500);
        return () => clearInterval(timerRef.current);
    }, [lockedUntil, offenses]);

    const isLocked = Boolean(lockedUntil && Date.now() < lockedUntil);
    const attemptsLeft = MAX_ATTEMPTS - attempts;
    // Label for the lockout tier the NEXT offense would trigger.
    const nextTierLabel = tierLabel(LOCKOUT_TIERS[Math.min(offenses, LOCKOUT_TIERS.length - 1)]);

    /** Record a failed login. Returns true when this failure locks the form. */
    const registerFailure = () => {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
            const newOffenses = offenses + 1;
            const durationMs = LOCKOUT_TIERS[Math.min(newOffenses - 1, LOCKOUT_TIERS.length - 1)];
            const until = Date.now() + durationMs;
            setOffenses(newOffenses);
            setLockedUntil(until);
            writeGuard({ attempts: newAttempts, lockedUntil: until, offenses: newOffenses });
            return true;
        }
        return false;
    };

    return {
        attempts, attemptsLeft, isLocked, countdown, nextTierLabel,
        registerFailure, resetGuard: clearGuard, MAX_ATTEMPTS,
    };
};

export default useLoginGuard;
