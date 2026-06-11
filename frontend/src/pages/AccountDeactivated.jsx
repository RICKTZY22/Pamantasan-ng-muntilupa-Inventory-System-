import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldSlash as ShieldX, Envelope as Mail, ArrowLeft, Warning as AlertTriangle } from '@phosphor-icons/react';
import plmunLogo from '../assets/images/logo.png';

const AccountDeactivated = () => {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-12">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-red-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-red-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 w-full max-w-lg">
                <div className="flex justify-center mb-8">
                    <div className="w-16 h-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg flex items-center justify-center p-2 border border-gray-200 dark:border-gray-700">
                        <img src={plmunLogo} alt="PLMun" className="w-full h-full object-contain" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-red-200 dark:border-red-800/50 overflow-hidden">
                    <div className="h-1.5 bg-gradient-to-r from-red-500 via-red-600 to-red-500" />

                    <div className="p-8 space-y-6">
                        <div className="flex justify-center">
                            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center ring-4 ring-red-50 dark:ring-red-900/20">
                                <ShieldX size={40} className="text-red-600 dark:text-red-400" />
                            </div>
                        </div>

                        <div className="text-center space-y-2">
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                Account Deactivated
                            </h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Your PLMun Nexus account has been deactivated
                            </p>
                        </div>

                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-5 space-y-3">
                            <div className="flex items-start gap-3">
                                <AlertTriangle size={20} className="text-red-500 mt-0.5 flex-shrink-0" />
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                                        Access Restricted
                                    </p>
                                    <p className="text-sm text-red-600 dark:text-red-400 leading-relaxed">
                                        An administrator has deactivated your account. You will not be able to log in, submit requests, or access any system features until your account is reactivated.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-5 border border-gray-200 dark:border-gray-600">
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                Possible Reasons
                            </p>
                            <ul className="space-y-2">
                                {[
                                    'Multiple overdue item returns',
                                    'Violation of borrowing policy',
                                    'Account flagged for suspicious activity',
                                    'Administrative review pending',
                                ].map((reason, i) => (
                                    <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                        <span className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 flex-shrink-0" />
                                        {reason}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 border border-amber-200 dark:border-amber-700/50">
                            <div className="flex items-start gap-3">
                                <Mail size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                                        Need help?
                                    </p>
                                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1 leading-relaxed">
                                        Please contact a <span className="font-bold">Staff member</span> or <span className="font-bold">Administrator</span> to inquire about reactivating your account.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <Link
                            to="/login"
                            // Login reads this flag to show its "account deactivated" notice.
                            onClick={() => localStorage.setItem('plmun-deactivated', '1')}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-200 text-sm"
                        >
                            <ArrowLeft size={16} />
                            Back to Login
                        </Link>
                    </div>
                </div>

                <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-6">
                    © {new Date().getFullYear()} PLMun Inventory Nexus · Pamantasan ng Lungsod ng Muntinlupa
                </p>
            </div>
        </div>
    );
};

export default AccountDeactivated;
