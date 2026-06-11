import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

export const AuthReveal = ({ as = 'div', children, className = '', ...props }) => (
    React.createElement(as, { className: `auth-reveal ${className}`, ...props }, children)
);

const AuthMotion = ({ children, className = '' }) => {
    const rootRef = useRef(null);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;

        if (prefersReducedMotion()) {
            gsap.set(root.querySelectorAll('.auth-entrance, .auth-reveal'), {
                autoAlpha: 1,
                clearProps: 'transform',
            });
            return undefined;
        }

        const ctx = gsap.context(() => {
            gsap.fromTo(
                root.querySelectorAll('.auth-entrance'),
                { autoAlpha: 0, y: 18 },
                {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.55,
                    ease: 'power2.out',
                    stagger: 0.055,
                    clearProps: 'transform',
                }
            );

            gsap.utils.toArray('.auth-reveal', root).forEach((item) => {
                gsap.fromTo(
                    item,
                    { autoAlpha: 0, y: 28 },
                    {
                        autoAlpha: 1,
                        y: 0,
                        duration: 0.65,
                        ease: 'power2.out',
                        clearProps: 'transform',
                        scrollTrigger: {
                            trigger: item,
                            start: 'top 88%',
                            once: true,
                        },
                    }
                );
            });
        }, root);

        ScrollTrigger.refresh();
        return () => ctx.revert();
    }, []);

    return (
        <div ref={rootRef} className={className}>
            {children}
        </div>
    );
};

export default AuthMotion;
