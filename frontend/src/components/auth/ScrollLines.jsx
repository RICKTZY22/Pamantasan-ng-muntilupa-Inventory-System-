import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const SVG_NS = 'http://www.w3.org/2000/svg';

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

// Almond leaf, stem at the origin, blade extending toward +x.
const LEAF_D = 'M0 0 Q 10 -15 26 -17 Q 17 -3 0 0 Z';

/**
 * Sprinkle leaves along a vine path using getPointAtLength so they always sit
 * exactly on the stem, alternating sides, rotated with the local tangent.
 * Returns [{ el, fraction }] so the timeline can pop each leaf in just as the
 * drawing tip passes it.
 */
const sproutLeaves = (path, { every = 150, size = 1 } = {}) => {
    const total = path.getTotalLength?.();
    if (!total) return [];
    const leaves = [];
    const count = Math.floor(total / every);
    for (let i = 1; i <= count; i += 1) {
        const len = i * every;
        const fraction = len / total;
        const p = path.getPointAtLength(len);
        const p2 = path.getPointAtLength(Math.min(len + 2, total));
        const angle = (Math.atan2(p2.y - p.y, p2.x - p.x) * 180) / Math.PI;
        const side = i % 2 ? 1 : -1;
        const scale = size * (0.85 + ((i * 7919) % 4) * 0.13); // deterministic variance

        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute(
            'transform',
            `translate(${p.x} ${p.y}) rotate(${angle + side * 65}) scale(${scale})`
        );
        g.setAttribute('opacity', '0');
        const leaf = document.createElementNS(SVG_NS, 'path');
        leaf.setAttribute('d', LEAF_D);
        leaf.setAttribute('fill', 'currentColor');
        g.appendChild(leaf);
        path.parentNode.appendChild(g);
        leaves.push({ el: g, fraction });
    }
    return leaves;
};

/**
 * Scrubbed vine growth: each path[data-vine] draws in step with scroll and its
 * leaves pop in as the tip passes them. `useSection` retriggers off the
 * closest <section> (absolute inset-0 overlays have no flow position).
 */
const useVines = (wrapRef, { start = 'top bottom', end = 'bottom bottom', useSection = false, leafEvery = 150, leafSize = 1 } = {}) => {
    useEffect(() => {
        const wrap = wrapRef.current;
        if (!wrap) return undefined;
        const paths = [...wrap.querySelectorAll('path[data-vine]')];
        const allLeaves = paths.map((p) => sproutLeaves(p, { every: leafEvery, size: leafSize }));

        if (prefersReducedMotion()) {
            paths.forEach((p) => { p.style.strokeDashoffset = '0'; });
            allLeaves.flat().forEach(({ el }) => el.setAttribute('opacity', '0.85'));
            return () => allLeaves.flat().forEach(({ el }) => el.remove());
        }

        // Absolute inset-0 overlays are unreliable ScrollTrigger targets —
        // always trigger off a real in-flow ancestor instead.
        const trigger = useSection
            ? (wrap.closest('section') || wrap.parentElement || wrap)
            : (wrap.parentElement || wrap);
        const ctx = gsap.context(() => {
            const tl = gsap.timeline({
                scrollTrigger: {
                    trigger,
                    start,
                    end,
                    scrub: 0.4,
                    onUpdate: (st) => {
                        if (import.meta.env.DEV) {
                            window.__vineDebug = window.__vineDebug || {};
                            window.__vineDebug[useSection ? 'credit' : 'frame'] = {
                                start: Math.round(st.start), end: Math.round(st.end),
                                progress: +st.progress.toFixed(3), scroll: Math.round(st.scroll()),
                            };
                        }
                    },
                },
            });
            paths.forEach((p, i) => {
                const at = i * 0.06; // near-parallel growth
                // Tween a plain proxy and write the offset ourselves — gsap's
                // CSS handling of unitless SVG stroke-dashoffset snaps to 0/1
                // instead of interpolating.
                const prox = { v: 1 };
                tl.to(prox, {
                    v: 0,
                    duration: 1,
                    ease: 'none',
                    onUpdate: () => p.setAttribute('stroke-dashoffset', prox.v),
                }, at);
                allLeaves[i].forEach(({ el, fraction }) => {
                    tl.to(el, { opacity: 0.85, duration: 0.04 }, at + fraction);
                });
            });
        });

        // Re-measure after late layout shifts (lazy images, fonts, Rive chunk).
        const refresh = () => ScrollTrigger.refresh();
        refresh();
        window.addEventListener('load', refresh);
        return () => {
            window.removeEventListener('load', refresh);
            ctx.revert();
            allLeaves.flat().forEach(({ el }) => el.remove());
        };
    }, [wrapRef, start, end, useSection, leafEvery, leafSize]);
};

const vineProps = {
    'data-vine': true,
    stroke: 'currentColor',
    strokeWidth: 4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
    pathLength: 1,
    strokeDasharray: 1,
    strokeDashoffset: 1,
    vectorEffect: 'non-scaling-stroke',
};

/**
 * Two vines growing down the side gutters of the below-fold content, from the
 * very top edge to the footer. The sway is evenly paced vertically so the
 * growing tip tracks the scroll position instead of drifting ahead/behind.
 */
export const ScrollLines = ({ className = 'text-plmun/50' }) => {
    const wrapRef = useRef(null);
    useVines(wrapRef, { start: 'top 95%', end: 'bottom bottom', leafEvery: 130, leafSize: 1.15 });

    return (
        <div ref={wrapRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 hidden lg:block ${className}`}>
            <svg className="w-full h-full" viewBox="0 0 1440 3000" preserveAspectRatio="none">
                {/* Left vine — gentle even S-sway, monotonic top → bottom */}
                <path {...vineProps} d="M 90 0
                    C 160 250, 40 500, 105 750
                    C 175 1000, 45 1250, 105 1500
                    C 170 1750, 55 2000, 105 2250
                    C 160 2500, 75 2750, 125 3000" />
                {/* Right vine — mirrored sway */}
                <path {...vineProps} d="M 1350 0
                    C 1280 250, 1400 500, 1335 750
                    C 1265 1000, 1395 1250, 1335 1500
                    C 1270 1750, 1385 2000, 1335 2250
                    C 1280 2500, 1365 2750, 1315 3000" />
            </svg>
        </div>
    );
};

/**
 * Section-local vines for "Behind the build": they grow down around the cards
 * and land on the Claude / GPT credit chips, finishing with a bud dot.
 */
export const CreditLines = ({ className = 'text-plmun/60' }) => {
    const wrapRef = useRef(null);
    useVines(wrapRef, { start: 'top 65%', end: 'bottom 95%', useSection: true, leafEvery: 110, leafSize: 0.9 });

    return (
        <div ref={wrapRef} aria-hidden="true" className={`pointer-events-none absolute inset-0 hidden md:block ${className}`}>
            <svg className="w-full h-full" viewBox="0 0 1000 640" preserveAspectRatio="none">
                {/* Into the Claude chip (left) */}
                <path {...vineProps} d="M 130 0
                    C 60 90, 25 180, 30 300
                    S 60 480, 180 540
                    C 270 582, 360 596, 425 600" />
                {/* Into the GPT chip (right) */}
                <path {...vineProps} d="M 870 0
                    C 940 90, 975 180, 970 300
                    S 940 480, 820 540
                    C 730 582, 640 596, 575 600" />
            </svg>
        </div>
    );
};

export default ScrollLines;
