import React from 'react';
import PropTypes from 'prop-types';
import { ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';

/**
 * ERR-02: Top-level Error Boundary
 * Catches unhandled React render errors and shows a recovery UI
 * instead of a blank white screen.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
                    <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <span className="text-2xl text-red-400">!</span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                            Something went wrong
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            An unexpected error occurred. Please try refreshing the page.
                        </p>
                        <div className="flex gap-3 justify-center pt-2">
                            <button
                                onClick={this.handleReset}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                            >
                                <RefreshCw size={14} />
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                Reload Page
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

ErrorBoundary.propTypes = {
    children: PropTypes.node.isRequired,
};

export default ErrorBoundary;

