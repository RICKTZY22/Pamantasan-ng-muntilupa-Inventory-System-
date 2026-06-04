import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { User, Envelope as Mail, Buildings as Building, Lock, Plus } from '@phosphor-icons/react';
import { Modal, Input, Button, PasswordStrengthMeter } from '../ui';
import { isPlmunEmail } from '../../utils/validators';
import { formatApiError } from '../../utils/errorUtils';
import api from '../../services/api';

const EMPTY = { fullName: '', email: '', username: '', password: '', password2: '', role: 'STUDENT', department: '' };
const sameText = (left, right) => {
    const a = String(left);
    const b = String(right);
    let diff = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
};

// Admin-only "create account" form. Mirrors the original Settings handler:
// posts to /auth/register/ and reports back via onCreated(message).
const CreateUserModal = ({ isOpen, onClose, onCreated }) => {
    const [form, setForm] = useState(EMPTY);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
    const close = () => { setForm(EMPTY); setError(''); onClose(); };

    const emailInvalid = form.email && !isPlmunEmail(form.email);
    const pwMismatch = form.password2 && !sameText(form.password, form.password2);

    const submit = async () => {
        setError('');
        const { fullName, email, username, password, password2, role, department } = form;
        if (!fullName || !email || !username || !password) {
            setError('Full name, email, username, and password are required.');
            return;
        }
        if (!sameText(password, password2)) { setError('Passwords do not match.'); return; }
        if (!isPlmunEmail(email)) { setError('Only @plmun.edu.ph email addresses are allowed.'); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        try {
            setLoading(true);
            await api.post('/auth/register/', { fullName, email, username, password, password2, role, department });
            onCreated(`✓ Account created for ${fullName} (${role})`);
            setForm(EMPTY);
            onClose();
        } catch (err) {
            setError(formatApiError(err, 'Failed to create account.') || 'Failed to create account.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title="Create New Account">
            <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Full Name" icon={User} placeholder="Juan Dela Cruz" value={form.fullName} onChange={set('fullName')} autoComplete="off" />
                    <Input label="Email" icon={Mail} type="email" placeholder="juan@plmun.edu.ph" value={form.email} error={emailInvalid ? 'Use a @plmun.edu.ph email' : ''} onChange={set('email')} autoComplete="off" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Username" icon={User} placeholder="juandelacruz" value={form.username} onChange={set('username')} autoComplete="off" />
                    <Input label="Department" icon={Building} placeholder="e.g., CICS" value={form.department} onChange={set('department')} autoComplete="off" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                    <select value={form.role} onChange={set('role')} className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40">
                        <option value="STUDENT">Student</option>
                        <option value="FACULTY">Faculty</option>
                        <option value="STAFF">Staff</option>
                        <option value="ADMIN">Administrator</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Input label="Password" icon={Lock} type="password" placeholder="Min 6 characters" value={form.password} onChange={set('password')} />
                        <PasswordStrengthMeter password={form.password} />
                    </div>
                    <Input label="Confirm Password" icon={Lock} type="password" placeholder="Re-enter password" value={form.password2} error={pwMismatch ? 'Passwords do not match' : ''} onChange={set('password2')} />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">{error}</p>}
                <div className="flex gap-3 justify-end pt-2">
                    <Button variant="ghost" onClick={close}>Cancel</Button>
                    <Button icon={Plus} onClick={submit} loading={loading} disabled={emailInvalid || pwMismatch}>Create Account</Button>
                </div>
            </div>
        </Modal>
    );
};

CreateUserModal.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onCreated: PropTypes.func.isRequired,
};

export default CreateUserModal;
