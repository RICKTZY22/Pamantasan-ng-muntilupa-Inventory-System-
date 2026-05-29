import { ChartBar as BarChart3, ClipboardText as ClipboardList, Package, Users } from '@phosphor-icons/react';

export const FEATURES = [
    {
        icon: Package,
        title: 'Real-Time Tracking',
        desc: 'Monitor equipment availability, borrowing status, and item conditions in real time across all departments.',
    },
    {
        icon: ClipboardList,
        title: 'Request Management',
        desc: 'Streamlined borrow/return workflow with approval chains, automated overdue detection, and audit trails.',
    },
    {
        icon: BarChart3,
        title: 'Analytics & Reports',
        desc: 'Comprehensive dashboards with usage trends, department-level breakdowns, and exportable reports.',
    },
    {
        icon: Users,
        title: 'Role-Based Access',
        desc: 'Granular permissions for Students, Faculty, Staff, and Admins - everyone sees only what they need.',
    },
];

export const ACCREDITATIONS = [
    {
        title: 'Commission on Higher Education (CHED)',
        desc: 'PLMun programs are duly recognized by Commission on Higher Education (CHED).',
        color: 'blue',
    },
    {
        title: 'Unified Financial Assistance (UniFAST)',
        desc: 'As recipient of the Free Higher Tertiary Education Program through UniFAST, PLMun students enjoy free tuition fee and other miscellaneous fees.',
        color: 'green',
    },
    {
        title: 'Association of Local Colleges & Universities (ALCUCOA)',
        desc: 'PLMun programs are duly recognized by the Association of Local Colleges and Universities (ALCUCOA).',
        color: 'red',
    },
];

export const DEMO_ACCOUNTS = [
    { label: 'Student', email: 'student@demo.plmun.local' },
    { label: 'Faculty', email: 'faculty@demo.plmun.local' },
    { label: 'Staff', email: 'staff@demo.plmun.local' },
    { label: 'Admin', email: 'admin@demo.plmun.local' },
];
