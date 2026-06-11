import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Envelope as Mail, Lock, Eye, EyeSlash as EyeOff, Warning as AlertTriangle,
    ArrowRight, CaretDown as ChevronDown, Users,
    GraduationCap, Buildings as Building2, Heart,
    Medal as Award, MapPin, Phone, At as AtSign, Code, Wrench, Package,
    FacebookLogo as Facebook, YoutubeLogo as Youtube, LinkedinLogo as Linkedin, TwitterLogo as Twitter,
} from '@phosphor-icons/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);
import useAuthStore from '../store/authStore';
import { useLoginGuard } from '../hooks';
import {
    AuthLayout, AuthInput, AuthHero, AuthMotion, AuthReveal,
    LineArt, ScrollLines, CreditLines, OpenAILogo, ClaudeLogo,
} from '../components/auth';
import { ACCREDITATIONS, DEMO_ACCOUNTS, FEATURES } from '../data/loginPageData';

import universityBuilding from '../assets/images/university-building.jpg';
import plmunLogo from '../assets/images/logo.png';

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '';

const SYSTEM_FACTS = [
    { label: 'User Roles', value: '4', sub: 'Student · Faculty · Staff · Admin' },
    { label: 'Availability', value: '24/7', sub: 'Web-based, any device' },
    { label: 'Frameworks', value: '2', sub: 'React + Django REST' },
    { label: 'Database', value: 'PostgreSQL', sub: 'Production-grade RDBMS' },
];

// Soft tint pairs for the feature-card icon chips (reference style).
const FEATURE_TINTS = [
    'bg-emerald-100 text-emerald-600',
    'bg-sky-100 text-sky-600',
    'bg-violet-100 text-violet-600',
    'bg-amber-100 text-amber-600',
];

const CARD = 'bg-white rounded-3xl shadow-[0_12px_40px_-14px_rgba(15,40,30,0.14)]';

// ── Land-book-style gallery ──
const GALLERY_FILTERS = ['All', 'Features', 'Facts', 'University', 'Accreditation', 'Creator'];

/** Gallery tile with the inspiration-gallery footer row (avatar · byline · likes). */
const GalleryCard = ({ by, likes, accent = 'bg-plmun', tone = 'light', className = '', children }) => (
    <AuthReveal
        className={`break-inside-avoid mb-4 rounded-xl overflow-hidden border transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
            tone === 'dark' ? 'bg-[#0f172a] border-[#1e293b]' : 'bg-white border-gray-200'
        } ${className}`}
    >
        {children}
        <div className={`flex items-center gap-2 px-4 py-3 border-t ${tone === 'dark' ? 'border-white/10' : 'border-gray-100'}`}>
            <span className={`w-5 h-5 rounded-full ${accent} flex-shrink-0`} aria-hidden="true" />
            <span className={`text-xs font-medium truncate ${tone === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>{by}</span>
            <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400">
                <Heart size={13} weight="fill" className="text-rose-400" /> {likes}
            </span>
        </div>
    </AuthReveal>
);

const Login = () => {
    const navigate = useNavigate();
    const { login, isLoading } = useAuthStore();
    const guard = useLoginGuard();

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [galleryFilter, setGalleryFilter] = useState('All');

    const pickFilter = (f) => {
        setGalleryFilter(f);
        // Masonry height changes move the vines' scroll positions.
        requestAnimationFrame(() => ScrollTrigger.refresh());
    };

    const [deactivatedNotice, setDeactivatedNotice] = useState(
        () => Boolean(localStorage.getItem('plmun-deactivated')),
    );

    useEffect(() => {
        localStorage.removeItem('plmun-deactivated');
    }, []);

    useEffect(() => {
        if (!deactivatedNotice) return;
        const t = setTimeout(() => setDeactivatedNotice(false), 15_000);
        return () => clearTimeout(t);
    }, [deactivatedNotice]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (guard.isLocked) return;

        setErrorMsg('');
        const result = await login({
            email: formData.email.trim().toLowerCase(),
            password: formData.password,
        });

        if (result.success) {
            guard.resetGuard();
            navigate('/dashboard');
        } else {
            // Don't count deactivated-account redirects as brute-force attempts.
            if (result.error === 'Account deactivated') return;

            const lockedNow = guard.registerFailure();
            setErrorMsg(lockedNow ? '' : (result.error || 'Invalid email or password. Please try again.'));
        }
    };

    // ── Gallery tiles (Land-book masonry), interleaved for varied column flow ──
    const featureTile = (i) => {
        const f = FEATURES[i];
        return {
            cat: 'Features',
            key: `feat-${i}`,
            el: (
                <GalleryCard by="PLMun Nexus" likes={11 + i * 3} accent="bg-emerald-500">
                    <div className="p-5">
                        <div className={`w-10 h-10 rounded-xl ${FEATURE_TINTS[i % FEATURE_TINTS.length]} flex items-center justify-center mb-3`}>
                            <f.icon size={20} />
                        </div>
                        <p className="text-sm font-bold text-gray-900 mb-1">{f.title}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
                    </div>
                </GalleryCard>
            ),
        };
    };

    const statTile = (i) => {
        const s = SYSTEM_FACTS[i];
        return {
            cat: 'Facts',
            key: `stat-${i}`,
            el: (
                <GalleryCard by="System facts" likes={7 + i * 2} accent="bg-amber-500">
                    <div className="p-5 text-center">
                        <p className="text-2xl font-bold text-plmun">{s.value}</p>
                        <p className="text-xs font-semibold text-gray-900 mt-1">{s.label}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
                    </div>
                </GalleryCard>
            ),
        };
    };

    const accrTile = (i) => {
        const a = ACCREDITATIONS[i];
        const tintMap = {
            blue: 'bg-sky-100 text-sky-600',
            green: 'bg-emerald-100 text-emerald-600',
            red: 'bg-rose-100 text-rose-500',
        };
        return {
            cat: 'Accreditation',
            key: `accr-${i}`,
            el: (
                <GalleryCard by="Accreditation" likes={9 + i * 4} accent="bg-sky-500">
                    <div className="p-5">
                        <div className={`w-10 h-10 rounded-xl ${tintMap[a.color]} flex items-center justify-center mb-3`}>
                            <Award size={20} />
                        </div>
                        <p className="text-sm font-bold text-gray-900 mb-1.5">{a.title}</p>
                        <p className="text-xs text-gray-500 leading-relaxed">{a.desc}</p>
                    </div>
                </GalleryCard>
            ),
        };
    };

    const campusTile = {
        cat: 'University',
        key: 'campus',
        el: (
            <GalleryCard by="PLMun · Muntinlupa City" likes={32} accent="bg-plmun">
                <img src={universityBuilding} alt="PLMun campus" loading="lazy" className="w-full h-44 object-cover" />
                <div className="p-4">
                    <p className="text-sm font-bold text-gray-900">Pamantasan ng Lungsod ng Muntinlupa</p>
                    <p className="text-xs text-gray-500 mt-1">Public university · Muntinlupa City</p>
                </div>
            </GalleryCard>
        ),
    };

    const missionTile = {
        cat: 'University',
        key: 'mission',
        el: (
            <GalleryCard by="PLMun" likes={19} accent="bg-plmun">
                <div className="p-5">
                    <p className="text-xs font-bold uppercase tracking-widest text-plmun mb-2">Our university</p>
                    <p className="text-sm text-gray-500 leading-relaxed">
                        PLMun is a public university in Muntinlupa City committed to quality, accessible
                        education — empowering students through instruction, research, and extension.
                    </p>
                </div>
            </GalleryCard>
        ),
    };

    const factsTile = {
        cat: 'University',
        key: 'quickfacts',
        el: (
            <GalleryCard by="Campus life" likes={24} accent="bg-rose-400">
                <div className="p-5 space-y-3">
                    {[
                        { icon: GraduationCap, label: 'Quality Education', desc: 'CHED-recognized programs', tint: 'bg-emerald-100 text-emerald-600' },
                        { icon: Building2, label: 'Modern Facilities', desc: 'Updated campus resources', tint: 'bg-sky-100 text-sky-600' },
                        { icon: Heart, label: 'Free Tuition', desc: 'UniFAST recipient', tint: 'bg-rose-100 text-rose-500' },
                        { icon: Users, label: 'Community-Centered', desc: 'Service & outreach', tint: 'bg-amber-100 text-amber-600' },
                    ].map((item) => (
                        <div key={item.label} className="flex items-start gap-3">
                            <div className={`w-8 h-8 rounded-lg ${item.tint} flex items-center justify-center flex-shrink-0`}>
                                <item.icon size={15} />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-gray-900">{item.label}</p>
                                <p className="text-[10px] text-gray-400">{item.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </GalleryCard>
        ),
    };

    const creatorTile = {
        cat: 'Creator',
        key: 'creator',
        el: (
            <GalleryCard tone="dark" by="Erick · Full-stack developer" likes={48} accent="bg-emerald-400">
                <div className="p-5">
                    <div className="w-10 h-10 rounded-xl bg-white/10 text-emerald-300 flex items-center justify-center mb-4">
                        <Code size={20} />
                    </div>
                    <p className="text-lg font-bold text-white leading-snug">
                        Designed &amp; developed end-to-end by Erick
                    </p>
                    <p className="text-sm text-gray-400 mt-2 leading-relaxed">
                        From the Django REST API and PostgreSQL data model to the React interface,
                        real-time messaging, and this very sign-in screen.
                    </p>
                </div>
            </GalleryCard>
        ),
    };

    const stackTile = {
        cat: 'Creator',
        key: 'stack',
        el: (
            <GalleryCard by="The toolbox" likes={21} accent="bg-sky-500">
                <div className="p-5">
                    <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center mb-3">
                        <Wrench size={20} />
                    </div>
                    <p className="text-sm font-bold text-gray-900 mb-3">How it was made</p>
                    <div className="flex flex-wrap gap-1.5">
                        {['React', 'Vite', 'Tailwind CSS', 'Django REST', 'PostgreSQL', 'WebSockets', 'Role-Based Access', 'Rive', 'GSAP'].map((t) => (
                            <span key={t} className="px-2.5 py-1 rounded-full bg-slate-100 text-[11px] font-medium text-gray-600">
                                {t}
                            </span>
                        ))}
                    </div>
                </div>
            </GalleryCard>
        ),
    };

    const galleryCards = [
        campusTile, featureTile(0), statTile(0), creatorTile,
        featureTile(1), accrTile(0), statTile(1), missionTile,
        featureTile(2), statTile(2), accrTile(1), stackTile,
        featureTile(3), factsTile, statTile(3), accrTile(2),
    ];
    const visibleCards = galleryFilter === 'All'
        ? galleryCards
        : galleryCards.filter((c) => c.cat === galleryFilter);

    return (
        <div className="min-h-screen bg-white dark:bg-gray-900 scroll-smooth">
            <AuthLayout
                headline={<>Welcome to<br />PLMun Nexus</>}
                subhead="Track, request, and manage university equipment in one place."
                hero={<AuthHero />}
            >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sign in</h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 mb-7">Enter your account details</p>

                <div aria-live="polite">
                    {deactivatedNotice && (
                        <div className="mb-5 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Account deactivated</p>
                                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                                    Your account has been deactivated by an administrator. Please contact a Staff member or Admin for assistance.
                                </p>
                            </div>
                            <button onClick={() => setDeactivatedNotice(false)} className="ml-auto text-red-400 hover:text-red-600 flex-shrink-0" aria-label="Dismiss">✕</button>
                        </div>
                    )}

                    {guard.isLocked && (
                        <div className="mb-5 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Sign-in temporarily locked</p>
                                <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">
                                    Too many failed attempts. Try again in{' '}
                                    <span className="font-bold tabular-nums text-sm">{guard.countdown}s</span>
                                </p>
                            </div>
                        </div>
                    )}

                    {!guard.isLocked && guard.attempts >= 3 && guard.attempts < guard.MAX_ATTEMPTS && (
                        <div className="mb-5 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 flex items-center gap-2">
                            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                {guard.attemptsLeft} attempt{guard.attemptsLeft !== 1 ? 's' : ''} remaining before {guard.nextTierLabel} lockout
                            </p>
                        </div>
                    )}

                    {errorMsg && !guard.isLocked && (
                        <div className="mb-5 p-3.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                            <p className="text-sm font-medium text-red-700 dark:text-red-300">{errorMsg}</p>
                        </div>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                    <AuthInput
                        id="login-email"
                        label="Email address"
                        icon={Mail}
                        type="email"
                        placeholder="your@plmun.edu.ph"
                        autoComplete="email"
                        value={formData.email}
                        disabled={guard.isLocked}
                        onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                    />

                    <AuthInput
                        id="login-password"
                        label="Password"
                        icon={Lock}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        value={formData.password}
                        disabled={guard.isLocked}
                        onChange={(e) => setFormData((f) => ({ ...f, password: e.target.value }))}
                        rightSlot={
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        }
                    />

                    <button
                        type="submit"
                        disabled={isLoading || guard.isLocked}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-plmun text-white font-semibold rounded-lg hover:bg-plmun-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed text-sm group"
                    >
                        {isLoading ? (
                            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Signing in…</>
                        ) : guard.isLocked ? (
                            `Locked — wait ${guard.countdown}s`
                        ) : (
                            <>Sign in <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform duration-200" /></>
                        )}
                    </button>
                </form>

                {/* Demo credentials — only rendered when VITE_DEMO_MODE=true. */}
                {import.meta.env.VITE_DEMO_MODE === 'true' && (
                    <div className="mt-6 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                            {DEMO_PASSWORD ? 'Demo accounts — click to autofill' : 'Demo accounts — click to fill email'}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {DEMO_ACCOUNTS.map((acct) => (
                                <button
                                    key={acct.label}
                                    type="button"
                                    onClick={() => setFormData((current) => ({
                                        email: acct.email,
                                        password: DEMO_PASSWORD || current.password,
                                    }))}
                                    className="text-xs font-medium py-1.5 px-2 rounded border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-plmun hover:text-plmun dark:hover:text-plmun-light transition-colors"
                                >
                                    {acct.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <p className="mt-7 text-sm text-gray-500 dark:text-gray-400">
                    Don't have an account?{' '}
                    <Link to="/register" className="text-plmun dark:text-plmun-light font-semibold hover:underline underline-offset-2">
                        Create one now
                    </Link>
                </p>

                <button
                    onClick={() => document.getElementById('about-section')?.scrollIntoView({ behavior: 'smooth' })}
                    className="mt-8 inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-plmun dark:hover:text-plmun-light transition-colors"
                >
                    Learn more about the system <ChevronDown size={14} />
                </button>
            </AuthLayout>

            {/* ── Below the fold: light, soft-card style with scroll-drawn lines.
                `light-island` keeps it light even when the app theme is dark. ── */}
            <AuthMotion className="light-island relative overflow-hidden bg-[#eef1f6]">
                {/* Soft color washes behind the cards (reference style) */}
                <div aria-hidden="true" className="pointer-events-none absolute -top-32 -left-32 w-[34rem] h-[34rem] rounded-full bg-emerald-200/50 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute top-1/4 -right-40 w-[30rem] h-[30rem] rounded-full bg-sky-200/40 blur-3xl" />
                <div aria-hidden="true" className="pointer-events-none absolute bottom-10 left-1/3 w-[36rem] h-[36rem] rounded-full bg-amber-100/50 blur-3xl" />

                {/* The two framing lines that draw while you scroll */}
                <ScrollLines />

                {/* ── Explore gallery (inspiration-gallery layout) ── */}
                <AuthReveal as="section" id="about-section" className="relative py-16 md:py-24 px-4 sm:px-6">
                    <div className="relative max-w-6xl mx-auto">
                        {/* Gallery hero */}
                        <div className="text-center mb-10 md:mb-12">
                            <div className="relative h-24 w-44 mx-auto mb-6" aria-hidden="true">
                                <div className="absolute left-0 top-3 w-20 h-20 rounded-xl border border-gray-200 bg-white shadow-md -rotate-12 overflow-hidden">
                                    <img src={universityBuilding} alt="" className="w-full h-full object-cover" />
                                </div>
                                <div className="absolute left-12 top-0 w-20 h-20 rounded-xl bg-plmun shadow-md rotate-2 flex items-center justify-center z-10">
                                    <img src={plmunLogo} alt="" className="w-11 h-11 object-contain" />
                                </div>
                                <div className="absolute right-0 top-3 w-20 h-20 rounded-xl border border-gray-200 bg-white shadow-md rotate-12 flex items-center justify-center">
                                    <Package size={28} className="text-plmun" />
                                </div>
                            </div>
                            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">PLMun Inventory Nexus</h2>
                            <p className="mt-3 text-gray-500 max-w-2xl mx-auto leading-relaxed text-sm sm:text-base">
                                Hand-picked highlights of the system, the university, and the story behind the build.
                            </p>
                        </div>

                        {/* Toolbar: label + filter pills */}
                        <div className="flex flex-wrap items-center gap-2 mb-5">
                            <p className="text-sm font-semibold text-gray-900 mr-auto">Explore the system</p>
                            {GALLERY_FILTERS.map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => pickFilter(f)}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                        galleryFilter === f
                                            ? 'bg-gray-900 text-white border-gray-900'
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>

                        {/* Masonry grid */}
                        <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                            {visibleCards.map((c) => (
                                <React.Fragment key={c.key}>{c.el}</React.Fragment>
                            ))}
                        </div>
                    </div>
                </AuthReveal>

                {/* ── Built with the help of ── */}
                <AuthReveal as="section" className="relative pt-28 md:pt-40 pb-16 md:pb-24 px-4 sm:px-6">
                    <div className="relative max-w-5xl mx-auto">
                        {/* Vines that flow down and land on the AI credit chips */}
                        <CreditLines />

                        <div className="relative flex flex-col items-center gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Built with the help of</p>
                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <span className={`${CARD} inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-gray-700`}>
                                    <ClaudeLogo size={15} className="text-[#D97757]" />
                                    Claude <span className="text-gray-300">·</span> Opus 4.8 &amp; Fable 5
                                </span>
                                <span className={`${CARD} inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-gray-700`}>
                                    <OpenAILogo size={15} className="text-gray-900" />
                                    GPT-5.5 Pro
                                </span>
                            </div>
                        </div>
                    </div>
                </AuthReveal>
            </AuthMotion>

            {/* ── Footer ── */}
            <footer className="relative bg-plmun-deep text-white overflow-hidden">
                <LineArt className="absolute inset-0 w-full h-full text-white/[0.05]" />
                <div className="relative px-4 sm:px-6 py-10 sm:py-14">
                    <div className="max-w-6xl mx-auto">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
                            <div className="space-y-4 col-span-2 lg:col-span-1">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 bg-white rounded-lg flex items-center justify-center p-1.5">
                                        <img src={plmunLogo} alt="PLMun logo" className="w-full h-full object-contain" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-white">PLMUN</p>
                                        <p className="text-white/60 text-[10px] leading-tight">Pamantasan ng Lungsod<br />ng Muntinlupa</p>
                                    </div>
                                </div>
                                <div className="space-y-2 text-sm text-white/70">
                                    <div className="flex items-start gap-2">
                                        <MapPin size={14} className="mt-0.5 flex-shrink-0 text-white/50" />
                                        <span>University Road NBP Reservation Brgy. Poblacion, City of Muntinlupa, Philippines, 1776</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone size={14} className="flex-shrink-0 text-white/50" />
                                        <span>02-8248-9161</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <AtSign size={14} className="flex-shrink-0 text-white/50" />
                                        <span>plmuncomm@plmun.edu.ph</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="font-bold text-sm text-white mb-4 uppercase tracking-wider">Quick Links</h4>
                                <ul className="space-y-2 text-sm text-white/70">
                                    {[
                                        { label: 'PLMun Official Website', href: 'https://www.plmun.edu.ph/' },
                                        { label: 'Academic Calendar', href: 'https://www.plmun.edu.ph/' },
                                        { label: 'News & Events', href: 'https://www.plmun.edu.ph/events.php' },
                                        { label: 'Contact Us', href: 'https://www.plmun.edu.ph/contact-us.php' },
                                    ].map((link) => (
                                        <li key={link.label}>
                                            <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                                {link.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div>
                                <h4 className="font-bold text-sm text-white mb-4 uppercase tracking-wider">Other Links</h4>
                                <ul className="space-y-2 text-sm text-white/70">
                                    {[
                                        { label: 'Muntinlupa City', href: 'https://www.muntinlupacity.gov.ph' },
                                        { label: 'CHED', href: 'https://www.ched.gov.ph' },
                                        { label: 'TESDA', href: 'https://www.tesda.gov.ph' },
                                    ].map((link) => (
                                        <li key={link.label}>
                                            <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                                                {link.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <h4 className="font-bold text-sm text-white mb-4 uppercase tracking-wider">Find Us On</h4>
                                    <div className="flex gap-3">
                                        {[
                                            { icon: Facebook, href: 'https://facebook.com', label: 'Facebook' },
                                            { icon: Youtube, href: 'https://youtube.com', label: 'YouTube' },
                                            { icon: Linkedin, href: 'https://linkedin.com', label: 'LinkedIn' },
                                            { icon: Twitter, href: 'https://twitter.com', label: 'Twitter' },
                                        ].map((social) => (
                                            <a
                                                key={social.label}
                                                href={social.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={social.label}
                                                className="w-9 h-9 rounded-lg border border-white/25 flex items-center justify-center hover:bg-white/10 transition-colors"
                                            >
                                                <social.icon size={16} className="text-white/80" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white mb-3 uppercase tracking-wider">Support</h4>
                                    <ul className="space-y-1.5 text-xs text-white/60">
                                        <li>ict@plmun.edu.ph</li>
                                        <li>support@plmun.edu.ph</li>
                                        <li>universityregistrar@plmun.edu.ph</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative border-t border-white/10 text-center py-4 px-6">
                    <p className="text-white/50 text-xs">
                        © {new Date().getFullYear()} Pamantasan ng Lungsod ng Muntinlupa · PLMun Inventory Nexus · All rights reserved.
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default Login;
