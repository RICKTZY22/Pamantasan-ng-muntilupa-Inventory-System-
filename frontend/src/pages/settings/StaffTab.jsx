import React from 'react';
import { Database, FileText, FloppyDisk as Save } from '@phosphor-icons/react';
import { Button, Toggle } from '../../components/ui';
import { SettingsGroup, SettingCard } from '../../components/settings';
import { StaffOnly } from '../../components/auth';

const SELECT = 'px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40';

const StaffTab = ({ staffSettings, setStaffSettings, categories, saveSettings, staffPrefsKey }) => (
    <StaffOnly showAccessDenied>
        <div className="space-y-5">
            <SettingsGroup title="Inventory defaults">
                <SettingCard
                    icon={Database}
                    title="Default category"
                    description="Pre-selected when adding items"
                    control={
                        <select value={staffSettings.defaultCategory} onChange={(e) => setStaffSettings({ ...staffSettings, defaultCategory: e.target.value })} className={SELECT} aria-label="Default category">
                            {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                    }
                />
                <SettingCard icon={Database} title="Default location" description="Pre-filled location for new items" expandable>
                    <input
                        type="text"
                        value={staffSettings.defaultLocation}
                        onChange={(e) => setStaffSettings({ ...staffSettings, defaultLocation: e.target.value })}
                        placeholder="e.g., Room 101"
                        className={`w-full ${SELECT}`}
                        aria-label="Default location"
                    />
                </SettingCard>
                <SettingCard
                    icon={Database}
                    title="Default status"
                    description="Status assigned to new items"
                    control={
                        <select value={staffSettings.defaultStatus} onChange={(e) => setStaffSettings({ ...staffSettings, defaultStatus: e.target.value })} className={SELECT} aria-label="Default status">
                            <option value="AVAILABLE">Available</option>
                            <option value="IN_USE">In Use</option>
                            <option value="MAINTENANCE">Under Maintenance</option>
                            <option value="RESERVED">Reserved</option>
                        </select>
                    }
                />
            </SettingsGroup>

            <SettingsGroup title="Reports">
                <SettingCard
                    icon={FileText}
                    title="Preferred format"
                    description="Format for exported reports"
                    control={
                        <select value={staffSettings.reportFormat} onChange={(e) => setStaffSettings({ ...staffSettings, reportFormat: e.target.value })} className={SELECT} aria-label="Report format">
                            <option value="pdf">PDF</option>
                            <option value="csv">CSV</option>
                        </select>
                    }
                />
                <SettingCard
                    icon={FileText}
                    title="Auto-generate reports"
                    description="Automatically generate and email reports"
                    wip
                    control={<Toggle checked={staffSettings.autoGenerateReports} onChange={(v) => setStaffSettings({ ...staffSettings, autoGenerateReports: v })} aria-label="Auto-generate reports" />}
                />
                {staffSettings.autoGenerateReports && (
                    <SettingCard
                        icon={FileText}
                        title="Report schedule"
                        description="How often to generate reports"
                        control={
                            <select value={staffSettings.reportSchedule} onChange={(e) => setStaffSettings({ ...staffSettings, reportSchedule: e.target.value })} className={SELECT} aria-label="Report schedule">
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        }
                    />
                )}
            </SettingsGroup>

            <div className="flex justify-end">
                <Button onClick={() => saveSettings(staffPrefsKey, staffSettings, 'Inventory settings')} icon={Save}>
                    Save changes
                </Button>
            </div>
        </div>
    </StaffOnly>
);

export default StaffTab;
