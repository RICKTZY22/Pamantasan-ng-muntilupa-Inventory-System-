import React from 'react';
import { FileText, Clock, GridFour as LayoutGrid, FloppyDisk as Save } from '@phosphor-icons/react';
import { Button, Toggle } from '../../components/ui';
import { SettingsGroup, SettingCard } from '../../components/settings';

const SELECT = 'px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40';

const PreferencesTab = ({
    preferences, setPreferences, saveSettings, prefsKey,
    viewMode, setViewMode, itemsPerPage, setItemsPerPage, showImages, setShowImages,
}) => (
    <div className="space-y-5">
        <SettingsGroup title="Request defaults">
            <SettingCard
                icon={FileText}
                title="Default quantity"
                description="Pre-filled quantity for new requests"
                control={
                    <input
                        type="number"
                        min="1"
                        max="10"
                        value={preferences.defaultQuantity}
                        onChange={(e) => setPreferences({ ...preferences, defaultQuantity: parseInt(e.target.value, 10) || 1 })}
                        className={`w-20 ${SELECT}`}
                        aria-label="Default quantity"
                    />
                }
            />
            <SettingCard icon={FileText} title="Default purpose template" description="Reused as the purpose for new requests" expandable>
                <textarea
                    value={preferences.defaultPurpose}
                    onChange={(e) => setPreferences({ ...preferences, defaultPurpose: e.target.value })}
                    placeholder="Enter a default purpose message for your requests..."
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                />
            </SettingCard>
        </SettingsGroup>

        <SettingsGroup title="Display">
            <SettingCard
                icon={LayoutGrid}
                title="View mode"
                description="How item lists are shown"
                control={
                    <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className={SELECT} aria-label="View mode">
                        <option value="table">Table</option>
                        <option value="card">Card</option>
                    </select>
                }
            />
            <SettingCard
                icon={LayoutGrid}
                title="Items per page"
                description="Rows shown before pagination"
                control={
                    <select value={itemsPerPage} onChange={(e) => setItemsPerPage(parseInt(e.target.value, 10))} className={SELECT} aria-label="Items per page">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                }
            />
            <SettingCard
                icon={LayoutGrid}
                title="Show item images"
                description="Display thumbnails in lists"
                control={<Toggle checked={showImages} onChange={setShowImages} aria-label="Show item images" />}
            />
        </SettingsGroup>

        <SettingsGroup title="Reminders">
            <SettingCard
                icon={Clock}
                title="Due date reminders"
                description="Get notified before items are due"
                wip
                control={<Toggle checked={preferences.dueDateReminder} onChange={(v) => setPreferences({ ...preferences, dueDateReminder: v })} aria-label="Due date reminders" />}
            />
            {preferences.dueDateReminder && (
                <SettingCard
                    icon={Clock}
                    title="Remind me before due date"
                    description="How early to remind you"
                    control={
                        <select value={preferences.reminderDays} onChange={(e) => setPreferences({ ...preferences, reminderDays: parseInt(e.target.value, 10) })} className={SELECT} aria-label="Reminder days">
                            <option value={1}>1 day</option>
                            <option value={2}>2 days</option>
                            <option value={3}>3 days</option>
                            <option value={7}>1 week</option>
                        </select>
                    }
                />
            )}
            <SettingCard
                icon={Clock}
                title="Auto-renew requests"
                description="Extend borrowing automatically if available"
                wip
                control={<Toggle checked={preferences.autoRenewRequests} onChange={(v) => setPreferences({ ...preferences, autoRenewRequests: v })} aria-label="Auto-renew requests" />}
            />
        </SettingsGroup>

        <div className="flex justify-end">
            <Button onClick={() => saveSettings(prefsKey, preferences, 'Preferences')} icon={Save}>
                Save changes
            </Button>
        </div>
    </div>
);

export default PreferencesTab;
