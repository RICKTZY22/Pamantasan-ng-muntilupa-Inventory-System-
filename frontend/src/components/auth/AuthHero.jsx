import React, { Suspense, useState } from 'react';
import plmunLogo from '../../assets/images/logo.png';

// Code-split: the Rive runtime (~170 kB) loads after first paint.
const RiveHero = React.lazy(() => import('./RiveHero'));

const HeroFallback = () => (
    <div className="w-full h-full flex items-center justify-center">
        <div className="w-28 h-28 rounded-full border-2 border-white/25 flex items-center justify-center bg-white/10">
            <img src={plmunLogo} alt="" aria-hidden="true" className="w-14 h-14 object-contain" />
        </div>
    </div>
);

/**
 * Brand-panel hero: the interactive Rive baller, lazy-loaded with a quiet logo
 * fallback. Users with prefers-reduced-motion get the static fallback and the
 * animation runtime is never downloaded.
 */
const AuthHero = () => {
    const [reducedMotion] = useState(
        () => typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );

    if (reducedMotion) return <HeroFallback />;

    return (
        <Suspense fallback={<HeroFallback />}>
            <RiveHero />
        </Suspense>
    );
};

export default AuthHero;
