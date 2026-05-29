import React from 'react';
import { FloppyDisk as Save } from '@phosphor-icons/react';
import { Button, Toggle } from '../../components/ui';
import { SettingsGroup, SettingCard } from '../../components/settings';

const ITEMS = [
    { key: 'emailNewRequests', label: 'New requests', desc: 'Email me when new requests are submitted' },
    { key: 'emailApprovals', label: 'Request approvals', desc: 'Email me when my requests are approved or rejected' },
    { key: 'emailInventory', label: 'Inventory updates', desc: 'Email me about stock changes' },
    { key: 'browserPush', label: 'Browser push', desc: 'Show desktop push notifications' },
    { key: 'weeklySummary', label: 'Weekly summary', desc: 'A weekly digest of activity' },
];

const NotificationsTab = ({ notifPrefs, setNotifPrefs, saveSettings, notifPrefsKey }) => (
    <div className="space-y-5">
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm text-blue-700 dark:text-blue-300">
            <strong>Work in progress</strong> — email and push delivery isn&apos;t active yet. Your choices are saved and applied once the service is enabled.
        </div>

        <SettingsGroup title="Notifications">
            {ITEMS.map((item) => (
                <SettingCard
                    key={item.key}
                    title={item.label}
                    description={item.desc}
                    control={
                        <Toggle
                            checked={!!notifPrefs[item.key]}
                            onChange={(v) => setNotifPrefs({ ...notifPrefs, [item.key]: v })}
                            aria-label={item.label}
                        />
                    }
                />
            ))}
        </SettingsGroup>

        <div className="flex justify-end">
            <Button onClick={() => saveSettings(notifPrefsKey, notifPrefs, 'Notification preferences')} icon={Save}>
                Save changes
            </Button>
        </div>
    </div>
);

export default NotificationsTab;
