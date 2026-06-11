import React from 'react';
import AuthMotion from './AuthMotion';
import plmunLogo from '../../assets/images/logo.png';
import universityBuilding from '../../assets/images/university-building.jpg';

/**
 * Shared split-screen shell for the auth pages.
 * Left side holds the form; right side holds the green/gold brand panel.
 */
const AuthLayout = ({ headline, subhead, hero, children }) => (
    <AuthMotion className="min-h-screen bg-white dark:bg-gray-900">
    <section className="min-h-screen flex">
        <div className="dark relative flex-1 flex flex-col min-h-screen overflow-hidden bg-[#0b1322]">
            <img
                src={universityBuilding}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover opacity-[0.16]"
            />

            <header className="auth-entrance relative z-10 flex items-center gap-3 px-6 sm:px-10 lg:px-16 pt-8">
                <div className="w-10 h-10 rounded-lg border border-gray-700 bg-white flex items-center justify-center p-1">
                    <img src={plmunLogo} alt="PLMun logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <p className="text-sm font-bold text-white leading-tight">PLMun Inventory Nexus</p>
                    <p className="text-xs text-gray-400">Pamantasan ng Lungsod ng Muntinlupa</p>
                </div>
            </header>

            <div className="relative z-10 flex-1 flex items-center px-6 sm:px-10 lg:px-16 py-10">
                <div className="auth-entrance w-full max-w-md mx-auto lg:mx-0">{children}</div>
            </div>

            <footer className="auth-entrance relative z-10 px-6 sm:px-10 lg:px-16 pb-6">
                <p className="text-xs text-gray-500">
                    &copy; {new Date().getFullYear()} Pamantasan ng Lungsod ng Muntinlupa
                </p>
            </footer>
        </div>

        <div className="hidden lg:flex lg:w-[46%] xl:w-[44%] relative overflow-hidden bg-[#063b2f]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#0b5f46] via-[#063b2f] to-[#021f1a]" aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 w-1.5 bg-[#f4c84a]" aria-hidden="true" />
            <div className="absolute inset-x-8 top-8 h-px bg-white/10" aria-hidden="true" />

            {hero && (
                <div className="auth-entrance absolute -left-8 -right-8 bottom-0 top-28 2xl:top-24 z-0">
                    {hero}
                </div>
            )}

            <div className="auth-entrance relative z-10 max-w-md px-10 pt-10 xl:px-14 xl:pt-12 pointer-events-none">
                <div className="mb-6 flex items-center gap-3">
                    <div className="h-12 w-12 rounded-lg bg-white p-1.5 shadow-lg shadow-black/20">
                        <img src={plmunLogo} alt="" aria-hidden="true" className="h-full w-full object-contain" />
                    </div>
                    <div className="h-px w-24 bg-[#f4c84a]" aria-hidden="true" />
                </div>

                <h1 className="text-3xl xl:text-4xl font-bold text-white leading-[1.08] drop-shadow-md">
                    {headline}
                </h1>
                {subhead && (
                    <p className="mt-4 text-white/80 text-base leading-7 max-w-sm drop-shadow">
                        {subhead}
                    </p>
                )}
            </div>

            <p className="auth-entrance absolute bottom-5 left-8 xl:left-10 z-10 text-emerald-50/65 text-xs pointer-events-none">
                University Road, Poblacion, Muntinlupa City
            </p>
        </div>
    </section>
    </AuthMotion>
);

export default AuthLayout;
