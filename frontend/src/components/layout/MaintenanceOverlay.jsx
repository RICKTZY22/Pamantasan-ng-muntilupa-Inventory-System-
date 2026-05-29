import { Wrench } from '@phosphor-icons/react';

const MaintenanceOverlay = ({ countdown }) => (
    <>
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[60]" style={{ pointerEvents: 'all' }} />

        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.3s ease-out' }}>
            <div
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-8 space-y-5 border border-amber-200 dark:border-amber-700/50"
                style={{ animation: 'scaleIn 0.3s ease-out' }}
            >
                <div className="flex justify-center">
                    <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <Wrench size={40} className="text-amber-600 dark:text-amber-400" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white">
                    System Under Maintenance
                </h2>

                <div className="text-center space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        The system is currently undergoing <span className="font-semibold text-amber-600">scheduled maintenance</span>.
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Only <span className="font-bold">Staff</span> and <span className="font-bold">Admin</span> accounts can access the system during this time.
                    </p>
                </div>

                {countdown && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-5 border border-amber-200 dark:border-amber-700/50 text-center">
                        <p className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold mb-2">
                            Estimated time remaining
                        </p>
                        <p className="text-4xl font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                            {countdown}
                        </p>
                    </div>
                )}

                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
                    <p className="text-sm text-center text-gray-500 dark:text-gray-400">
                        Please check back later. If you need urgent access, contact an administrator.
                    </p>
                </div>
            </div>
        </div>
    </>
);

export default MaintenanceOverlay;
