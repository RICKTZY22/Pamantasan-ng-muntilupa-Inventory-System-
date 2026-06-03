import { useEffect, useState } from 'react';
import api from '../services/api';
import { ROLES, hasMinRole } from '../utils/roles';

// Maintenance mode is a rare admin action, so a slow poll is plenty — a user
// drops into the maintenance screen within ~a minute of it being enabled.
// (Was 10s, which spammed the backend with a request every 10s per user.)
const POLL_MS = 60_000;
const TICK_MS = 1_000;

const formatCountdown = (endTime) => {
    const diff = endTime - Date.now();
    if (diff <= 0) return '0:00';

    const hours = Math.floor(diff / 3_600_000);
    const minutes = Math.floor((diff % 3_600_000) / 60_000);
    const seconds = Math.floor((diff % 60_000) / 1_000);

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
        : `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const useMaintenanceWindow = (userRole = ROLES.STUDENT) => {
    const [maintenance, setMaintenance] = useState({ active: false, endTime: 0 });
    const [countdown, setCountdown] = useState('');

    useEffect(() => {
        const checkMaintenance = async () => {
            try {
                const { data } = await api.get('/auth/maintenance/');
                const isActive = data.enabled && data.endTime > Date.now();

                setMaintenance({
                    active: isActive,
                    endTime: isActive ? data.endTime : 0,
                });
            } catch {
                // Keep the last known state if the API is temporarily unreachable.
            }
        };

        checkMaintenance();
        const interval = setInterval(checkMaintenance, POLL_MS);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!maintenance.active || maintenance.endTime === 0) {
            setCountdown('');
            return undefined;
        }

        const tick = () => setCountdown(formatCountdown(maintenance.endTime));
        tick();

        const timer = setInterval(tick, TICK_MS);
        return () => clearInterval(timer);
    }, [maintenance]);

    return {
        countdown,
        isBlocked: maintenance.active && !hasMinRole(userRole, ROLES.STAFF),
        maintenanceActive: maintenance.active,
    };
};

export default useMaintenanceWindow;
