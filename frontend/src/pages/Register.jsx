import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Envelope as Mail, Lock, User, Users, Shield, Eye, EyeSlash as EyeOff, CheckCircle as CheckCircle2, XCircle, Hash } from '@phosphor-icons/react';
import useAuthStore from '../store/authStore';
import { AnimatedInput } from '../components/ui';
import universityBuilding from '../assets/images/university-building.jpg';
import plmunLogo from '../assets/images/logo.png';

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
        <div className="mt-2 space-y-1 animate-fade-in">
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                    <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all duration-500 ease-out ${i <= score ? color : 'bg-gray-200 dark:bg-gray-700'}`}
                        style={{ transitionDelay: `${i * 60}ms` }}
                    />
                ))}
            </div>
            <p className={`text-xs font-semibold transition-colors duration-300 ${textColor}`}>{label}</p>
        </div>
    );
};



const Register = () => {
    const navigate = useNavigate();
    const { register, isLoading, error, clearError } = useAuthStore();
    const [mounted, setMounted] = useState(false);

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

    useEffect(() => { setMounted(true); }, []);

    const handleChange = (field) => (e) => {
        clearError();
        setValidationError('');
        setFormData(prev => ({ ...prev, [field]: e.target.value }));
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
        const error = validateForm();
        if (error) {
            setValidationError(error);
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
        <div className="min-h-screen flex overflow-hidden">
            <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
                <div
                    className="absolute inset-0 bg-cover bg-center scale-105 transition-transform duration-[20s] hover:scale-100"
                    style={{ backgroundImage: `url(${universityBuilding})` }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-gray-900/85 via-accent/25 to-gray-900/75" />

                <div className="absolute top-20 right-12 w-40 h-40 bg-accent/15 rounded-full blur-3xl animate-float" />
                <div className="absolute bottom-40 left-8 w-56 h-56 bg-accent-light/10 rounded-full blur-3xl animate-float-reverse" />
                <div className="absolute top-1/2 left-1/3 w-24 h-24 bg-white/5 rounded-full blur-2xl animate-float-slow" />

                <div className="absolute inset-0 opacity-[0.04]"
                    style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

                <div className={`relative z-10 flex flex-col justify-between p-12 w-full transition-all duration-700 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`}>
                    <div className="flex items-center gap-4"
                        style={{ transitionDelay: '100ms' }}>
                        <div className="w-14 h-14 bg-white rounded-2xl shadow-xl flex items-center justify-center p-1.5 ring-2 ring-white/40 hover:scale-110 transition-transform duration-300">
                            <img src={plmunLogo} alt="PLMun Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <p className="text-white font-bold text-sm leading-tight">PLMun Inventory Nexus</p>
                            <p className="text-white/60 text-xs">Pamantasan ng Lungsod ng Muntinlupa</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h1
                            className={`text-4xl font-bold text-white leading-tight transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                            style={{ transitionDelay: '200ms' }}
                        >
                            Join the<br />
                            <span className="text-accent-light">PLMun</span><br />
                            Community.
                        </h1>
                        <p
                            className={`text-white/70 leading-relaxed max-w-xs text-sm transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                            style={{ transitionDelay: '350ms' }}
                        >
                            Create your account and get access to the inventory management system for faculty, staff, and students.
                        </p>
                    </div>

                    <p className={`text-white/40 text-xs transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '700ms' }}>
                        © {new Date().getFullYear()} Pamantasan ng Lungsod ng Muntinlupa · "Lakas, Talino, at Buhay"
                    </p>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center relative bg-gray-50 dark:bg-gray-900 px-6 py-10">
                <div
                    className="absolute inset-0 bg-cover bg-center lg:hidden"
                    style={{ backgroundImage: `url(${universityBuilding})` }}
                />
                <div className="absolute inset-0 bg-gray-900/80 lg:hidden" />

                <div
                    className={`relative z-10 w-full max-w-md transition-all duration-700 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
                    style={{ transitionDelay: '150ms' }}
                >
                    <div className={`flex justify-center mb-6 lg:hidden transition-all duration-500 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                        <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center p-2 animate-logo-pop">
                            <img src={plmunLogo} alt="PLMun Logo" className="w-full h-full object-contain" />
                        </div>
                    </div>

                    <div
                        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
                        style={{ transitionDelay: '250ms' }}
                    >
                        <div
                            className={`mb-6 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
                            style={{ transitionDelay: '350ms' }}
                        >
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create account</h2>
                            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Fill in the details below to get started</p>
                        </div>

                        {(error || validationError) && (
                            <div className="mb-5 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 animate-slide-in">
                                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                                    {error || validationError}
                                </p>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
                            <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '400ms' }}>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">Full Name</label>
                                <AnimatedInput icon={User} type="text" placeholder="Juan Dela Cruz" value={formData.fullName} onChange={handleChange('fullName')} autoComplete="name" />
                            </div>

                            <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '450ms' }}>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">Email Address</label>
                                <AnimatedInput icon={Mail} type="email" placeholder="your@plmun.edu.ph" value={formData.email} onChange={handleChange('email')} autoComplete="email" />
                            </div>

                            <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '500ms' }}>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">Department</label>
                                <AnimatedInput icon={Users} type="text" placeholder="e.g. CCS, CBA" value={formData.department} onChange={handleChange('department')} autoComplete="organization" />
                            </div>

                            {formData.role === 'STUDENT' && (
                                <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '520ms' }}>
                                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">Student ID Number</label>
                                    <AnimatedInput icon={Hash} type="text" placeholder="e.g. 2024-00123" value={formData.studentId} onChange={handleChange('studentId')} autoComplete="one-time-code" name="student-id-number" />
                                    <p className="text-[10px] text-gray-400 mt-1 ml-0.5">Your official PLMun student ID number</p>
                                </div>
                            )}

                            <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '550ms' }}>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">Password</label>
                                <AnimatedInput
                                    icon={Lock}
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={handleChange('password')}
                                    autoComplete="new-password"
                                    rightSlot={
                                        <button type="button" tabIndex={-1} onClick={() => setShowPassword(v => !v)}
                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                        </button>
                                    }
                                />
                                <PasswordStrengthBar password={formData.password} />
                            </div>

                            <div className={`transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '620ms' }}>
                                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 ml-0.5">Confirm Password</label>
                                <div className="relative">
                                    <AnimatedInput
                                        icon={Lock}
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={formData.confirmPassword}
                                        onChange={handleChange('confirmPassword')}
                                        autoComplete="new-password"
                                        borderClass={
                                            formData.confirmPassword
                                                ? passwordsMatch
                                                    ? 'border-green-400 dark:border-green-600 ring-2 ring-green-400/20'
                                                    : 'border-red-400 dark:border-red-600 ring-2 ring-red-400/20'
                                                : undefined
                                        }
                                        rightSlot={
                                            <div className="flex items-center gap-1">
                                                {formData.confirmPassword && (
                                                    <span className="animate-scale-in">
                                                        {passwordsMatch
                                                            ? <CheckCircle2 size={14} className="text-green-500" />
                                                            : <XCircle size={14} className="text-red-400" />
                                                        }
                                                    </span>
                                                )}
                                                <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)}
                                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-0.5">
                                                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                                </button>
                                            </div>
                                        }
                                    />
                                </div>
                            </div>

                            <div className={`pt-2 transition-all duration-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`} style={{ transitionDelay: '700ms' }}>
                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-accent text-white font-semibold rounded-lg shadow-sm hover:bg-accent-dark hover:shadow-md transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                                >
                                    {isLoading ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                            Creating account...
                                        </>
                                    ) : 'Create Account'}
                                </button>
                            </div>
                        </form>

                        <div className={`mt-5 text-center transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '780ms' }}>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Already have an account?{' '}
                                <Link to="/login" className="text-accent font-semibold hover:underline underline-offset-2 hover:text-accent-dark transition-colors">
                                    Sign in
                                </Link>
                            </p>
                        </div>
                    </div>

                    <div className={`mt-5 flex items-center justify-center gap-2 text-gray-400 text-xs transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '850ms' }}>
                        <Shield size={13} />
                        <span>Your information is protected and encrypted</span>
                    </div>
                    <p className={`text-center text-gray-400 text-xs mt-2 transition-all duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`} style={{ transitionDelay: '900ms' }}>
                        © {new Date().getFullYear()} Pamantasan ng Lungsod ng Muntinlupa · All rights reserved.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Register;
