import React from 'react';
import { PencilSimple as Edit3, Trash as Trash2, FloppyDisk as Save, Plus } from '@phosphor-icons/react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { Button } from '../../components/ui';
import { SettingsGroup } from '../../components/settings';
import { StaffOnly } from '../../components/auth';

const INPUT = 'px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-accent/40';

// One editable list (categories or conditions). Index keys are intentional so
// the inline edit input keeps focus while typing.
const EditableList = ({ items, setItems, editing, setEditing, newValue, setNewValue, addPlaceholder }) => {
    const [listRef] = useAutoAnimate();
    const add = () => {
        if (newValue.trim()) {
            setItems([...items, newValue.trim()]);
            setNewValue('');
        }
    };
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700/60 bg-white dark:bg-gray-800/40 p-4 sm:p-5">
            <div ref={listRef} className="space-y-2">
                {items.map((val, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        {editing === i ? (
                            <input
                                type="text"
                                value={val}
                                onChange={(e) => {
                                    const updated = [...items];
                                    updated[i] = e.target.value;
                                    setItems(updated);
                                }}
                                onBlur={() => setEditing(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                                autoFocus
                                className="flex-1 bg-white dark:bg-gray-600 border border-accent rounded px-2 py-1 text-sm outline-none"
                            />
                        ) : (
                            <span className="text-sm text-gray-800 dark:text-gray-200">{val}</span>
                        )}
                        <div className="flex gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" icon={Edit3} onClick={() => setEditing(i)} aria-label={`Edit ${val}`}>Edit</Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={Trash2}
                                className="text-red-500 hover:text-red-600"
                                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                                aria-label={`Delete ${val}`}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex gap-2 mt-3">
                <input
                    type="text"
                    placeholder={addPlaceholder}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && add()}
                    className={`flex-1 ${INPUT}`}
                />
                <Button variant="outline" icon={Plus} onClick={add}>Add</Button>
            </div>
        </div>
    );
};

const SystemTab = ({
    categories, setCategories, conditions, setConditions,
    editingCategory, setEditingCategory, editingCondition, setEditingCondition,
    newCategory, setNewCategory, newCondition, setNewCondition,
    flashMessage,
}) => (
    <StaffOnly showAccessDenied>
        <div className="space-y-5">
            <SettingsGroup title="Inventory categories">
                <EditableList
                    items={categories}
                    setItems={setCategories}
                    editing={editingCategory}
                    setEditing={setEditingCategory}
                    newValue={newCategory}
                    setNewValue={setNewCategory}
                    addPlaceholder="New category name"
                />
            </SettingsGroup>

            <SettingsGroup title="Item conditions">
                <EditableList
                    items={conditions}
                    setItems={setConditions}
                    editing={editingCondition}
                    setEditing={setEditingCondition}
                    newValue={newCondition}
                    setNewValue={setNewCondition}
                    addPlaceholder="New condition name"
                />
            </SettingsGroup>

            <div className="flex justify-end">
                <Button
                    icon={Save}
                    onClick={() => {
                        try {
                            localStorage.setItem('sys-settings', JSON.stringify({ categories, conditions }));
                            flashMessage('System settings saved successfully!');
                        } catch {
                            flashMessage('✗ Failed to save system settings');
                        }
                    }}
                >
                    Save changes
                </Button>
            </div>
        </div>
    </StaffOnly>
);

export default SystemTab;
