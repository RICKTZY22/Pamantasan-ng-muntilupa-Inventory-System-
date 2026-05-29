import React, { useMemo, memo } from 'react';
import useUIStore from '../../store/uiStore';
import './AnimatedBackground.css';

// Pre-generate random positions once to avoid recalculating on every render
const generatePositions = (count, seed = 1) => {
    const positions = [];
    for (let i = 0; i < count; i++) {
        // Use deterministic pseudo-random based on index
        const rand1 = ((i * 17 + seed) % 100);
        const rand2 = ((i * 31 + seed) % 100);
        const rand3 = ((i * 13 + seed) % 3);
        const rand4 = ((i * 23 + seed) % 5);
        positions.push({
            left: rand1,
            top: rand2,
            delay: rand3,
            duration: 2 + rand4,
        });
    }
    return positions;
};

// Memoized positions for each effect
const starPositions = generatePositions(50, 1); // Reduced from 100 to 50
const particlePositions = generatePositions(25, 2); // Reduced from 50 to 25
const meteorPositions = generatePositions(6, 3); // Reduced from 10 to 6
const matrixColumns = 15; // Reduced from 30 to 15

const AnimatedBackground = memo(() => {
    const { backgroundEffect } = useUIStore();

    // Memoize the entire render to prevent unnecessary recalculations
    const content = useMemo(() => {
        if (backgroundEffect === 'none') return null;

        switch (backgroundEffect) {
            case 'stars':
                return (
                    <div className="stars-container">
                        {starPositions.map((pos, i) => (
                            <div
                                key={i}
                                className="star"
                                style={{
                                    left: `${pos.left}%`,
                                    top: `${pos.top}%`,
                                    animationDelay: `${pos.delay}s`,
                                    animationDuration: `${pos.duration}s`,
                                }}
                            />
                        ))}
                    </div>
                );

            case 'meteors':
                return (
                    <div className="meteors-container">
                        {meteorPositions.map((pos, i) => (
                            <div
                                key={i}
                                className="meteor"
                                style={{
                                    left: `${pos.left}%`,
                                    animationDelay: `${i * 2}s`,
                                    animationDuration: `${1 + pos.delay}s`,
                                }}
                            />
                        ))}
                    </div>
                );

            case 'particles':
                return (
                    <div className="particles-container">
                        {particlePositions.map((pos, i) => (
                            <div
                                key={i}
                                className="particle"
                                style={{
                                    left: `${pos.left}%`,
                                    animationDelay: `${pos.delay}s`,
                                    animationDuration: `${5 + pos.duration * 2}s`,
                                }}
                            />
                        ))}
                    </div>
                );

            case 'aurora':
                return (
                    <div className="aurora-container">
                        <div className="aurora aurora-1" />
                        <div className="aurora aurora-2" />
                        <div className="aurora aurora-3" />
                    </div>
                );

            case 'matrix':
                return (
                    <div className="matrix-container">
                        {[...Array(matrixColumns)].map((_, i) => (
                            <div
                                key={i}
                                className="matrix-column"
                                style={{
                                    left: `${i * (100 / matrixColumns)}%`,
                                    animationDelay: `${(i * 0.5) % 5}s`,
                                    animationDuration: `${4 + (i % 3)}s`,
                                }}
                            >
                                {/* Use static characters instead of random */}
                                {'アイウエオカキクケコサシスセソタチツテト'.split('').map((char, j) => (
                                    <span key={j} style={{ animationDelay: `${j * 0.15}s` }}>
                                        {char}
                                    </span>
                                ))}
                            </div>
                        ))}
                    </div>
                );

            default:
                return null;
        }
    }, [backgroundEffect]);

    if (!content) return null;

    return (
        <div className="animated-background" aria-hidden="true">
            {content}
        </div>
    );
});

AnimatedBackground.displayName = 'AnimatedBackground';

export default AnimatedBackground;
