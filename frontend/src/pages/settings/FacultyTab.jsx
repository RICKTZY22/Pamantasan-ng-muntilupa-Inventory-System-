import React from 'react';
import { BookOpen, Briefcase, Shield, FloppyDisk as Save } from '@phosphor-icons/react';
import { Button, Toggle } from '../../components/ui';
import { SettingsGroup, SettingCard } from '../../components/settings';
import { FacultyOnly } from '../../components/auth';

const INPUT = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40';
const NUM = 'w-24 px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40';

const FacultyTab = ({ facultySettings, setFacultySettings, saveSettings, facultyPrefsKey }) => (
    <FacultyOnly showAccessDenied>
        <div className="space-y-5">
            <SettingsGroup title="Department & courses">
                <SettingCard icon={BookOpen} title="Department" description="Your teaching department" expandable defaultOpen>
                    <input
                        type="text"
                        value={facultySettings.department}
                        onChange={(e) => setFacultySettings({ ...facultySettings, department: e.target.value })}
                        placeholder="e.g., College of Information Technology"
                        className={INPUT}
                        aria-label="Department"
                    />
                </SettingCard>
                <SettingCard icon={BookOpen} title="Courses taught" description="Course codes separated by commas" expandable>
                    <input
                        type="text"
                        value={(facultySettings.courses || []).join(', ')}
                        onChange={(e) => setFacultySettings({ ...facultySettings, courses: e.target.value.split(',').map(c => c.trim()).filter(Boolean) })}
                        placeholder="e.g., IT101, IT201, CAPSTONE"
                        className={INPUT}
                        aria-label="Courses taught"
                    />
                </SettingCard>
            </SettingsGroup>

            <SettingsGroup title="Borrowing limits">
                <SettingCard
                    icon={Briefcase}
                    title="Maximum items"
                    description="Items you can borrow at once"
                    wip
                    control={<input type="number" min="1" max="50" value={facultySettings.maxBorrowItems} onChange={(e) => setFacultySettings({ ...facultySettings, maxBorrowItems: parseInt(e.target.value, 10) || 1 })} className={NUM} aria-label="Maximum items" />}
                />
                <SettingCard
                    icon={Briefcase}
                    title="Maximum days"
                    description="Borrowing period in days"
                    wip
                    control={<input type="number" min="1" max="90" value={facultySettings.maxBorrowDays} onChange={(e) => setFacultySettings({ ...facultySettings, maxBorrowDays: parseInt(e.target.value, 10) || 1 })} className={NUM} aria-label="Maximum days" />}
                />
            </SettingsGroup>

            <SettingsGroup title="Approval preferences">
                <SettingCard
                    icon={Shield}
                    title="Auto-approve student requests"
                    description="Automatically approve requests from your students"
                    wip
                    control={<Toggle checked={facultySettings.autoApproveOwnStudents} onChange={(v) => setFacultySettings({ ...facultySettings, autoApproveOwnStudents: v })} aria-label="Auto-approve student requests" />}
                />
                <SettingCard
                    icon={Shield}
                    title="Require justification"
                    description="Require students to provide a detailed purpose"
                    wip
                    control={<Toggle checked={facultySettings.requireJustification} onChange={(v) => setFacultySettings({ ...facultySettings, requireJustification: v })} aria-label="Require justification" />}
                />
            </SettingsGroup>

            <div className="flex justify-end">
                <Button onClick={() => saveSettings(facultyPrefsKey, facultySettings, 'Faculty settings')} icon={Save}>
                    Save changes
                </Button>
            </div>
        </div>
    </FacultyOnly>
);

export default FacultyTab;
