import React from 'react';
import PropTypes from 'prop-types';

// Edge-style settings group: a small section header above a single rounded
// card containing all rows separated by thin dividers.
//
// Bundling is auto-detected: if every child is a SettingCard, they're rendered
// flush inside one rounded card with dividers (Edge style). Otherwise we fall
// back to the older spaced-out layout so callers passing custom children
// (e.g. tables, editable lists) keep working without double borders.
//
// Pass `bundled={false}` to force the spaced layout even for SettingCards.
const isSettingCard = (child) =>
    React.isValidElement(child) && child.type && child.type.displayName === 'SettingCard';

const SettingsGroup = ({ title, description, icon: Icon, children, bundled = true, className = '' }) => {
    const flatChildren = React.Children.toArray(children).filter(Boolean);
    const allSettingCards = flatChildren.length > 0 && flatChildren.every(isSettingCard);
    const willBundle = bundled && allSettingCards;

    const renderedChildren = willBundle
        ? flatChildren.map((child) => {
            const hasNakedProp = child.props && Object.prototype.hasOwnProperty.call(child.props, 'naked');
            return hasNakedProp ? child : React.cloneElement(child, { naked: true });
        })
        : flatChildren;

    return (
        <section className={className}>
            {(title || description) && (
                <div className="mb-2 px-1">
                    {title && (
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            {Icon && <Icon size={16} className="text-accent" />}
                            {title}
                        </h3>
                    )}
                    {description && (
                        <p className={`text-xs text-gray-500 dark:text-gray-400 mt-0.5 ${Icon ? 'pl-6' : ''}`}>{description}</p>
                    )}
                </div>
            )}
            {willBundle ? (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
                    {renderedChildren}
                </div>
            ) : (
                <div className="space-y-2">{renderedChildren}</div>
            )}
        </section>
    );
};

SettingsGroup.propTypes = {
    title: PropTypes.string,
    description: PropTypes.string,
    icon: PropTypes.elementType,
    children: PropTypes.node,
    bundled: PropTypes.bool,
    className: PropTypes.string,
};

export default SettingsGroup;
