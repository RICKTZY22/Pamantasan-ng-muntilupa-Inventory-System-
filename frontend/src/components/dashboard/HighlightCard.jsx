import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';

// Gradient feature card with an icon, headline, sub, and a CTA. Used as the
// right-rail highlight (low-stock alert for staff, "New Request" for students).
const HighlightCard = ({ icon: Icon, title, subtitle, actionLabel, to, state, onClick, gradient = 'from-emerald-500 to-teal-600' }) => {
    const action = actionLabel && (
        <span className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-sm font-semibold backdrop-blur-sm transition-colors">
            {actionLabel} <ArrowRight size={16} weight="bold" />
        </span>
    );

    return (
        <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} p-6 text-white shadow-card`}>
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" aria-hidden="true" />
            <div className="absolute -bottom-10 -left-6 w-28 h-28 rounded-full bg-white/5" aria-hidden="true" />
            <div className="relative">
                {Icon && (
                    <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-white/20 mb-4">
                        <Icon size={24} weight="duotone" />
                    </span>
                )}
                <h3 className="text-lg font-bold leading-snug">{title}</h3>
                {subtitle && <p className="text-sm text-white/80 mt-1">{subtitle}</p>}
                {action && (
                    to
                        ? <Link to={to} state={state}>{action}</Link>
                        : <button type="button" onClick={onClick}>{action}</button>
                )}
            </div>
        </div>
    );
};

HighlightCard.propTypes = {
    icon: PropTypes.elementType,
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string,
    actionLabel: PropTypes.string,
    to: PropTypes.string,
    state: PropTypes.object,
    onClick: PropTypes.func,
    gradient: PropTypes.string,
};

export default HighlightCard;
