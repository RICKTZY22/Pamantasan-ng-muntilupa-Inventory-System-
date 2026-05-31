import React from 'react';
import { Lock } from '@phosphor-icons/react';
import { Button, Input, PasswordStrengthMeter } from '../../components/ui';
import { SettingsGroup } from '../../components/settings';

// Input renders its own show/hide toggle for type="password".
const SecurityTab = ({ passwordForm, setPasswordForm, passwordError, setPasswordError, handlePasswordChange, isLoading }) => (
    <SettingsGroup title="Change password">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-4 sm:p-5 space-y-4 max-w-md">
            <Input
                label="Current Password"
                type="password"
                icon={Lock}
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            />
            <div>
                <Input
                    label="New Password"
                    type="password"
                    icon={Lock}
                    autoComplete="new-password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                />
                <PasswordStrengthMeter password={passwordForm.newPassword} />
            </div>
            <Input
                label="Confirm New Password"
                type="password"
                icon={Lock}
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(e) => { setPasswordForm({ ...passwordForm, confirmPassword: e.target.value }); setPasswordError(''); }}
            />
            {passwordError && (
                <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 px-3 py-2 rounded-lg">{passwordError}</p>
            )}
            <Button onClick={handlePasswordChange} loading={isLoading}>
                Update Password
            </Button>
        </div>
    </SettingsGroup>
);

export default SecurityTab;
