import React from 'react';
import { Clock, CheckCircle, Package, ArrowCounterClockwise as RotateCcw, X, PaperPlaneTilt as Send } from '@phosphor-icons/react';

/**
 * Visual progress bar showing the request lifecycle.
 */

const STEPS = [
    { key: 'PENDING', label: 'Pending', icon: Clock, color: 'amber' },
    { key: 'APPROVED', label: 'Approved', icon: CheckCircle, color: 'emerald' },
    { key: 'COMPLETED', label: 'Completed', icon: Package, color: 'blue' },
    { key: 'RETURNED', label: 'Returned', icon: RotateCcw, color: 'purple' },
];

const TERMINAL = { REJECTED: 'red', CANCELLED: 'gray' };

const stepIndex = (status) => STEPS.findIndex(s => s.key === status);

const RequestProgressBar = ({ status, compact = false }) => {
    const isTerminal = !!TERMINAL[status];
    const currentIdx = isTerminal ? -1 : stepIndex(status);

    if (compact) {
        // Compact: single-line dot progress
        return (
            <div className="flex items-center gap-1.5">
                {STEPS.map((step, i) => {
                    const done = !isTerminal && i <= currentIdx;
                    const active = !isTerminal && i === currentIdx;
                    return (
                        <React.Fragment key={step.key}>
                            <div
                                className={`w-2.5 h-2.5 rounded-full transition-all ${done
                                        ? active
                                            ? `bg-${step.color}-500 ring-2 ring-${step.color}-200 dark:ring-${step.color}-800`
                                            : `bg-${step.color}-400`
                                        : 'bg-gray-200 dark:bg-gray-600'
                                    }`}
                                title={step.label}
                            />
                            {i < STEPS.length - 1 && (
                                <div className={`w-4 h-0.5 ${!isTerminal && i < currentIdx
                                        ? 'bg-emerald-300 dark:bg-emerald-600'
                                        : 'bg-gray-200 dark:bg-gray-600'
                                    }`} />
                            )}
                        </React.Fragment>
                    );
                })}
                {isTerminal && (
                    <span className={`ml-2 text-xs font-medium ${status === 'REJECTED' ? 'text-red-500' : 'text-gray-400'
                        }`}>
                        {status === 'REJECTED' ? 'Rejected' : 'Cancelled'}
                    </span>
                )}
            </div>
        );
    }

    // Full: labeled steps with connector lines
    return (
        <div className="w-full">
            <div className="flex items-center justify-between">
                {STEPS.map((step, i) => {
                    const StepIcon = step.icon;
                    const done = !isTerminal && i <= currentIdx;
                    const active = !isTerminal && i === currentIdx;

                    return (
                        <React.Fragment key={step.key}>
                            <div className="flex flex-col items-center" style={{ minWidth: 56 }}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${done
                                        ? active
                                            ? `bg-${step.color}-500 text-white shadow-md`
                                            : `bg-${step.color}-100 dark:bg-${step.color}-900/40 text-${step.color}-600 dark:text-${step.color}-400`
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-400'
                                    }`}>
                                    <StepIcon size={14} />
                                </div>
                                <span className={`text-[10px] mt-1 font-medium ${done ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                                    }`}>
                                    {step.label}
                                </span>
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`flex-1 h-0.5 mx-1 mt-[-14px] ${!isTerminal && i < currentIdx
                                        ? 'bg-emerald-300 dark:bg-emerald-600'
                                        : 'bg-gray-200 dark:bg-gray-600'
                                    }`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
            {isTerminal && (
                <div className={`mt-2 text-center text-xs font-medium ${status === 'REJECTED' ? 'text-red-500' : 'text-gray-400'
                    }`}>
                    {status === 'REJECTED' ? '✗ Request Rejected' : '— Cancelled'}
                </div>
            )}
        </div>
    );
};

export default RequestProgressBar;
