import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
    DotsThreeVertical, Envelope as Mail, Phone, Warning as AlertTriangle,
    Buildings as Building, IdentificationCard, UserCircleMinus, UserCircleCheck,
    ShieldCheck, Trash as Trash2,
} from '@phosphor-icons/react';
import { ROLES } from '../../utils/roles';
import { Avatar } from '../ui';
import { getRoleMeta } from './roleMeta';

// One person card in the User Management grid: avatar + role, info chips,
// Email/Phone footer, and a kebab ⋯ menu for admin actions.
const UserCard = ({ user, onChangeRole, onToggleStatus, onUnflag, onDelete }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const name = user.fullName || user.full_name || user.username || user.email || 'Unknown';
    const meta = getRoleMeta(user.role);
    const active = user.isActive ?? user.is_active;
    const studentId = user.studentId || user.student_id;
    const avatar = user.avatar || user.avatarUrl;

    // Close the menu on outside-click or Escape.
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [menuOpen]);

    const act = (fn) => { setMenuOpen(false); fn(); };

    return (
        <div className={`relative flex flex-col rounded-2xl border bg-white dark:bg-gray-800/50 shadow-card transition-shadow hover:shadow-card-hover ${user.isFlagged ? 'border-red-200 dark:border-red-800/40' : 'border-gray-200 dark:border-gray-700/60'} ${!active ? 'opacity-70' : ''}`}>
            {/* Kebab menu */}
            <div className="absolute top-3 right-3" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label={`Actions for ${name}`}
                    aria-expanded={menuOpen}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                >
                    <DotsThreeVertical size={20} weight="bold" />
                </button>
                {menuOpen && (
                    <div className="absolute right-0 mt-1 w-52 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-20 p-1.5 animate-scale-in">
                        <label className="block px-2 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Role</label>
                        <select
                            value={user.role}
                            onChange={(e) => act(() => onChangeRole(user.id, e.target.value))}
                            className="w-full mb-1.5 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40"
                            aria-label={`Change role for ${name}`}
                        >
                            <option value={ROLES.STUDENT}>Student</option>
                            <option value={ROLES.FACULTY}>Faculty</option>
                            <option value={ROLES.STAFF}>Staff</option>
                            <option value={ROLES.ADMIN}>Administrator</option>
                        </select>
                        <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                        <button type="button" onClick={() => act(() => onToggleStatus(user.id))} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors">
                            {active ? <UserCircleMinus size={17} className="text-amber-500" /> : <UserCircleCheck size={17} className="text-emerald-500" />}
                            {active ? 'Deactivate' : 'Activate'}
                        </button>
                        {user.isFlagged && (
                            <button type="button" onClick={() => act(() => onUnflag(user.id))} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors">
                                <ShieldCheck size={17} className="text-emerald-500" />
                                Remove flag
                            </button>
                        )}
                        <button type="button" onClick={() => act(() => onDelete(user))} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <Trash2 size={17} />
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {/* Identity */}
            <div className="flex flex-col items-center text-center px-5 pt-6 pb-4">
                <div className="relative">
                    <Avatar src={avatar} name={name} size={64} gradient={meta.gradient} className="ring-2 ring-gray-100 dark:ring-gray-700" />
                    <span className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800 ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} title={active ? 'Active' : 'Inactive'} />
                </div>
                <h3 className="mt-3 font-semibold text-gray-900 dark:text-white truncate max-w-full">{name}</h3>
                <span className={`mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
                    <meta.Icon size={12} weight="fill" />
                    {meta.label}
                </span>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate max-w-full">{user.email}</p>

                {/* Info chips */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                    {user.department && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
                            <Building size={11} /> {user.department}
                        </span>
                    )}
                    {studentId && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300">
                            <IdentificationCard size={11} /> {studentId}
                        </span>
                    )}
                    {user.isFlagged && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                            <AlertTriangle size={11} /> Flagged · {user.overdueCount || 0}
                        </span>
                    )}
                </div>
            </div>

            {/* Email / Phone footer */}
            <div className="grid grid-cols-2 border-t border-gray-100 dark:border-gray-700/60 divide-x divide-gray-100 dark:divide-gray-700/60 mt-auto">
                <a href={`mailto:${user.email}`} className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                    <Mail size={16} /> Email
                </a>
                {user.phone ? (
                    <a href={`tel:${user.phone}`} className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                        <Phone size={16} /> Phone
                    </a>
                ) : (
                    <span className="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-gray-300 dark:text-gray-600 cursor-not-allowed" title="No phone number">
                        <Phone size={16} /> Phone
                    </span>
                )}
            </div>
        </div>
    );
};

UserCard.propTypes = {
    user: PropTypes.object.isRequired,
    onChangeRole: PropTypes.func.isRequired,
    onToggleStatus: PropTypes.func.isRequired,
    onUnflag: PropTypes.func.isRequired,
    onDelete: PropTypes.func.isRequired,
};

export default UserCard;
