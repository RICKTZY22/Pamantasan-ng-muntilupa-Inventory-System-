import React from 'react';
import { User, Camera, Envelope as Mail, Phone, Buildings as Building, FloppyDisk as Save, Hash } from '@phosphor-icons/react';
import { Button, Input, Avatar } from '../../components/ui';
import { getRoleLabel, getRoleBadgeColor } from '../../utils/roles';

const ProfileTab = ({ user, profileForm, setProfileForm, handleProfileSave, updateAvatar, isLoading }) => {
    return (
        <div className="space-y-5">
            <div className="flex items-center gap-6 p-5 sm:p-6 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/60">
                <div className="relative">
                    <Avatar src={user?.avatar} name={user?.fullName} size={96} gradient="from-accent to-secondary" className="ring-4 ring-accent/20" />
                    <label className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-gray-700 rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors cursor-pointer">
                        <Camera size={16} className="text-gray-600 dark:text-gray-300" />
                        <span className="sr-only">Upload profile photo</span>
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files[0];
                                if (file) {
                                    if (file.size > 5 * 1024 * 1024) {
                                        alert('Image must be 5MB or smaller');
                                        return;
                                    }
                                    updateAvatar(file);
                                }
                            }}
                        />
                    </label>
                </div>
                <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">{user?.fullName}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                    <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user?.role)}`}>
                        {getRoleLabel(user?.role)}
                    </span>
                    {user?.role === 'STUDENT' && user?.studentId && (
                        <span className="inline-block mt-1 ml-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-medium">
                            ID: {user.studentId}
                        </span>
                    )}
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Click the camera to upload a photo</p>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-4 sm:p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                        label="Full Name"
                        icon={User}
                        value={profileForm.fullName}
                        onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                    />
                    <Input
                        label="Email Address"
                        icon={Mail}
                        type="email"
                        value={profileForm.email}
                        disabled
                        className="opacity-70"
                    />
                    <Input
                        label="Phone Number"
                        icon={Phone}
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                    />
                    <Input
                        label="Department"
                        icon={Building}
                        value={profileForm.department}
                        onChange={(e) => setProfileForm({ ...profileForm, department: e.target.value })}
                    />
                    {user?.role === 'STUDENT' && (
                        <Input
                            label="Student ID"
                            icon={Hash}
                            value={user?.studentId || ''}
                            disabled
                            className="opacity-70"
                        />
                    )}
                </div>
            </div>

            <div className="flex justify-end">
                <Button onClick={handleProfileSave} loading={isLoading} icon={Save}>
                    Save changes
                </Button>
            </div>
        </div>
    );
};

export default ProfileTab;
