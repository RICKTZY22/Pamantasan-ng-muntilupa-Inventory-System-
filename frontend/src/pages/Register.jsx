import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Envelope as Mail, Lock, User, Users, Eye, EyeSlash as EyeOff,
    CheckCircle as CheckCircle2, XCircle, Hash,
} from '@phosphor-icons/react';
import useAuthStore from '../store/authStore';
import { AuthLayout, AuthInput } from '../components/auth';

const getPasswordStrength = (password) => {
    if (!password) return { score: 0, label: '', color: '', textColor: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (score <= 1) return { score, label: 'Weak', color: 'bg-red-500', textColor: 'text-red-500' };
    if (score === 2) return { score, label: 'Fair', color: 'bg-orange-400', textColor: 'text-orange-400' };
    if (score === 3) return { score, label: 'Good', color: 'bg-yellow-400', textColor: 'text-yellow-500' };
    if (score === 4) return { score, label: 'Strong', color: 'bg-green-500', textColor: 'text-green-500' };
    return { score, label: 'Very Strong', color: 'bg-emerald-500', textColor: 'text-emerald-500' };
};

const PasswordStrengthBar = ({ password }) => {
    const { score, label, color, textColor } = getPasswordStrength(password);
    if (!password) return null;
    return (
        <div className="mt-2 space-y-1">
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= score ? color : 'bg-gray-200 dark:bg-gray-700'}`}
                    />
                ))}
            </div>
            <p className={`text-xs font-semibold ${textColor}`}>{label}</p>
        </div>
    );
};

const Register = () => {
    const navigate = useNavigate();
    const { register, isLoading, error, clearError } = useAuthStore();

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        department: '',
        studentId: '',
        password: '',
        confirmPassword: '',
        role: 'STUDENT',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [validationError, setValidationError] = useState('');

    const handleChange = (field) => (e) => {
        clearError();
        setValidationError('');
        setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const validateForm = () => {
        if (!formData.email.trim().toLowerCase().endsWith('@plmun.edu.ph')) {
            return 'Only @plmun.edu.ph email addresses are allowed.';
        }
        if (formData.password !== formData.confirmPassword) {
            return 'Passwords do not match';
        }
        if (formData.password.length < 8) {
            return 'Password must be at least 8 characters';
        }
        const strength = getPasswordStrength(formData.password);
        if (strength.score < 2) {
            return 'Password is too weak. Add uppercase letters, numbers, or symbols.';
        }
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setValidationError('');
        const validation = validateForm();
        if (validation) {
            setValidationError(validation);
            return;
        }
        const result = await register({
            fullName: formData.fullName.trim(),
            email: formData.email.trim().toLowerCase(),
            password: formData.password,
            role: formData.role,
            department: formData.department.trim(),
            studentId: formData.role === 'STUDENT' ? formData.studentId.trim() : '',
        });
        if (result.success) navigate('/dashboard');
    };

    const passwordsMatch = formData.confirmPassword && formData.password === formData.confirmPassword;

    return (
        <AuthLayout
            headline={<>Join the<br />PLMun community</>}
            subhead="Create your account and get access to the university's equipment and resource hub."
        >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create account</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 mb-7">Fill in the details below to get started</p>

            <div aria-live="polite">
                {(error || validationError) && (
                    <div className="mb-5 p-3.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">{error || validationError}</p>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5" autoComplete="off">
                <AuthInput
                    id="reg-name"
                    label="Full name"
                    icon={User}
                    type="text"
                    placeholder="Juan Dela Cruz"
                    autoComplete="name"
                    value={formData.fullName}
                    onChange={handleChange('fullName')}
                />

                <AuthInput
                    id="reg-email"
                    label="Email address"
                    icon={Mail}
                    type="email"
                    placeholder="your@plmun.edu.ph"
                    autoComplete="email"
                    hint="Only @plmun.edu.ph addresses are accepted"
                    value={formData.email}
                    onChange={handleChange('email')}
                />

                <div className="grid sm:grid-cols-2 gap-5">
                    <AuthInput
                        id="reg-department"
                        label="Department"
                        icon={Users}
                        type="text"
                        placeholder="e.g. CCS, CBA"
                        autoComplete="organization"
                        value={formData.department}
                        onChange={handleChange('department')}
                    />

                    {formData.role === 'STUDENT' && (
                        <AuthInput
                            id="reg-student-id"
                            label="Student ID number"
                            icon={Hash}
                            type="text"
                            placeholder="e.g. 2024-00123"
                            autoComplete="one-time-code"
                            name="student-id-number"
                            value={formData.studentId}
                            onChange={handleChange('studentId')}
                        />
                    )}
                </div>

                <div>
                    <AuthInput
                        id="reg-password"
                        label="Password"
                        icon={Lock}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={handleChange('password')}
                        rightSlot={
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        }
                    />
                    <PasswordStrengthBar password={formData.password} />
                </div>

                <AuthInput
                    id="reg-confirm"
                    label="Confirm password"
                    icon={Lock}
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    value={formData.confirmPassword}
                    invalid={Boolean(formData.confirmPassword) && !passwordsMatch}
                    valid={Boolean(passwordsMatch)}
                    onChange={handleChange('confirmPassword')}
                    rightSlot={
                        <>
                            {formData.confirmPassword && (
                                passwordsMatch
                                    ? <CheckCircle2 size={14} className="text-green-500" />
                                    : <XCircle size={14} className="text-red-400" />
                            )}
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowConfirmPassword((v) => !v)}
                                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </>
                    }
                />

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-plmun text-white font-semibold rounded-lg hover:bg-plmun-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                    {isLoading ? (
                        <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating account…</>
                    ) : 'Create account'}
                </button>
            </form>

            <p className="mt-7 text-sm text-gray-500 dark:text-gray-400">
                Already have an account?{' '}
                <Link to="/login" className="text-plmun dark:text-plmun-light font-semibold hover:underline underline-offset-2">
                    Sign in
                </Link>
            </p>
        </AuthLayout>
    );
};

export default Register;
