import { ShieldWarning as ShieldAlert, SignOut as LogOut } from '@phosphor-icons/react';

const AccountFlagOverlay = ({ dismissed, onDismiss, onLogout, overdueCount }) => (
    <>
        <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40"
            style={{ pointerEvents: 'all' }}
        />

        {!dismissed && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                <div
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-red-200 dark:border-red-800/50"
                    style={{ animation: 'scaleIn 0.3s ease-out' }}
                >
                    <div className="flex justify-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <ShieldAlert size={32} className="text-red-600 dark:text-red-400" />
                        </div>
                    </div>

                    <h2 className="text-xl font-bold text-center text-gray-900 dark:text-white">
                        Account Flagged
                    </h2>

                    <div className="text-center space-y-2">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            Your account has been flagged due to <span className="font-semibold text-red-600">overdue item returns</span>.
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            While flagged, you <span className="font-bold">cannot perform any actions</span> such as borrowing items or making requests.
                        </p>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700/50">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 text-center">
                            Please contact an Admin or Staff member to resolve this issue and restore your account access.
                        </p>
                    </div>

                    {overdueCount > 0 && (
                        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                            Overdue incidents: <span className="font-bold text-red-600">{overdueCount}</span>
                        </p>
                    )}

                    <div className="flex flex-col gap-2">
                        <button
                            onClick={onDismiss}
                            className="w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                            I Understand
                        </button>
                        <button
                            onClick={onLogout}
                            className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <LogOut size={16} />
                            Log Out
                        </button>
                    </div>
                </div>
            </div>
        )}
    </>
);

export default AccountFlagOverlay;
