import React from 'react';

/**
 * Abstract SVG line-art used across the auth pages and the public sections.
 * Pure strokes (no fills, no gradients) — the parent controls the color via
 * `currentColor`, e.g. `text-white/10` on the green brand panel or
 * `text-plmun/10` on white sections.
 */
const LineArt = ({ className = '' }) => (
    <svg
        viewBox="0 0 800 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        aria-hidden="true"
        className={`pointer-events-none select-none ${className}`}
    >
        {/* Flowing contour curves across the upper half */}
        <path d="M-40 210 C 140 130, 330 310, 520 235 S 830 150, 860 215" stroke="currentColor" strokeWidth="1.5" />
        <path d="M-40 250 C 140 170, 330 350, 520 275 S 830 190, 860 255" stroke="currentColor" strokeWidth="1.5" />
        <path d="M-40 290 C 140 210, 330 390, 520 315 S 830 230, 860 295" stroke="currentColor" strokeWidth="1.5" />
        <path d="M-40 330 C 140 250, 330 430, 520 355 S 830 270, 860 335" stroke="currentColor" strokeWidth="1.5" />

        {/* Concentric circles, bottom left */}
        <circle cx="110" cy="790" r="190" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="110" cy="790" r="140" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="110" cy="790" r="90" stroke="currentColor" strokeWidth="1.5" />

        {/* Offset rounded squares, top right */}
        <rect x="590" y="50" width="220" height="220" rx="44" stroke="currentColor" strokeWidth="1.5" />
        <rect x="630" y="90" width="220" height="220" rx="44" stroke="currentColor" strokeWidth="1.5" />

        {/* Long diagonal accents, lower right */}
        <path d="M 520 880 L 840 560" stroke="currentColor" strokeWidth="1.5" />
        <path d="M 580 890 L 860 610" stroke="currentColor" strokeWidth="1.5" />

        {/* Dot grid, mid left */}
        {[0, 1, 2, 3, 4].map((row) =>
            [0, 1, 2, 3].map((col) => (
                <circle
                    key={`d-${row}-${col}`}
                    cx={60 + col * 26}
                    cy={420 + row * 26}
                    r="2"
                    fill="currentColor"
                    stroke="none"
                />
            ))
        )}

        {/* Plus marks */}
        <path d="M 706 420 h 24 M 718 408 v 24" stroke="currentColor" strokeWidth="1.5" />
        <path d="M 300 96 h 20 M 310 86 v 20" stroke="currentColor" strokeWidth="1.5" />
        <path d="M 380 760 h 20 M 390 750 v 20" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

export default LineArt;
