import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
    CheckCircle,
    ChartBar as BarChart2,
    ChartLineUp,
    ClipboardText,
    DownloadSimple as Download,
    FileText,
    Package,
    CircleNotch as Loader2,
    Warning as AlertTriangle,
} from '@phosphor-icons/react';
import { Button, Card } from '../components/ui';
import { BarChartComponent, LineChartComponent, PieChartComponent } from '../components/dashboard';
import { StaffOnly } from '../components/auth';
import { useInventory, useRequests } from '../hooks';
import { getOverdueAge } from '../utils/timeUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
// html2canvas removed — PDF uses data tables instead of chart screenshots

const RANGE_OPTIONS = [
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' },
    { value: 'all', label: 'All Time' },
];

const METRIC_TONES = {
    primary: 'bg-primary/10 text-primary border-primary/20',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800/50',
    blue: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800/50',
    amber: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/50',
    red: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800/50',
};

const ReportMetricCard = ({ icon, label, value, hint, tone = 'primary' }) => (
    <Card className="p-4">
        <div className="flex items-start gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${METRIC_TONES[tone] || METRIC_TONES.primary}`}>
                {React.createElement(icon, { size: 22, weight: 'duotone' })}
            </span>
            <div className="min-w-0">
                <p className="text-2xl font-bold leading-tight text-gray-900 dark:text-white tabular-nums">{value}</p>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{label}</p>
                {hint && <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
            </div>
        </div>
    </Card>
);

const EmptyPanel = ({ icon = FileText, title, message }) => (
    <Card className="flex h-[300px] items-center justify-center text-center">
        <div>
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-700/60 dark:text-gray-500">
                {React.createElement(icon, { size: 24, weight: 'duotone' })}
            </span>
            <p className="font-semibold text-gray-700 dark:text-gray-200">{title}</p>
            {message && <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">{message}</p>}
        </div>
    </Card>
);

const SectionTitle = ({ kicker, title, description }) => (
    <div>
        {kicker && <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">{kicker}</p>}
        <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
);

const Reports = () => {
    const [dateRange, setDateRange] = useState('month');
    const { inventory, fetchInventory, fetchStats: fetchInventoryStats, loading: inventoryLoading } = useInventory();
    const { requests, fetchRequests, loading: requestsLoading } = useRequests();

    // Fetch real data on mount
    // Reports always include cleared (soft-deleted) requests so charts keep historical data
    useEffect(() => {
        fetchInventory();
        fetchInventoryStats();
        fetchRequests({ include_cleared: true });
    }, [fetchInventory, fetchInventoryStats, fetchRequests]);

    // Get the start date for the selected time period
    const getDateCutoff = (range) => {
        const now = new Date();
        switch (range) {
            case 'week': {
                const d = new Date(now);
                d.setDate(d.getDate() - d.getDay());
                d.setHours(0, 0, 0, 0);
                return d;
            }
            case 'month':
                return new Date(now.getFullYear(), now.getMonth(), 1);
            case 'quarter': {
                const qMonth = Math.floor(now.getMonth() / 3) * 3;
                return new Date(now.getFullYear(), qMonth, 1);
            }
            case 'year':
                return new Date(now.getFullYear(), 0, 1);
            default:
                return new Date(0);
        }
    };

    // Filter inventory by selected date range
    const filteredInventory = useMemo(() => {
        if (!inventory || inventory.length === 0) return [];
        const cutoff = getDateCutoff(dateRange);
        return inventory.filter(item => {
            const d = new Date(item.created_at || item.createdAt || item.dateAdded);
            return d >= cutoff;
        });
    }, [inventory, dateRange]);

    // Filter requests by selected date range
    const filteredRequests = useMemo(() => {
        if (!requests || requests.length === 0) return [];
        const cutoff = getDateCutoff(dateRange);
        return requests.filter(r => {
            const d = new Date(r.createdAt || r.requestDate);
            return d >= cutoff;
        });
    }, [requests, dateRange]);

    // Filtered summary stats for the cards
    const filteredStats = useMemo(() => {
        const inv = filteredInventory;
        const req = filteredRequests;
        const approved = req.filter(r => ['APPROVED', 'COMPLETED', 'RETURNED'].includes(r.status)).length;
        const rejected = req.filter(r => ['REJECTED', 'CANCELLED'].includes(r.status)).length;
        const total = approved + rejected;
        return {
            totalItems: inv.length,
            availableItems: inv.filter(i => i.status === 'AVAILABLE').length,
            totalRequests: req.length,
            approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
        };
    }, [filteredInventory, filteredRequests]);

    // Category distribution from ALL inventory (not date-filtered)
    const categoryDistribution = useMemo(() => {
        if (!inventory || inventory.length === 0) return [];
        const cats = {};
        inventory.forEach(item => {
            const cat = item.category || 'Other';
            const label = cat.charAt(0) + cat.slice(1).toLowerCase();
            cats[label] = (cats[label] || 0) + 1;
        });
        return Object.entries(cats).map(([name, value]) => ({ name, value }));
    }, [inventory]);

    // How many months of data to show in trend charts
    const numMonths = useMemo(() => {
        switch (dateRange) {
            case 'week': return 1;
            case 'month': return 3;
            case 'quarter': return 4;
            case 'year': return 12;
            default: return 6;
        }
    }, [dateRange]);

    // Monthly request trends broken down by status — uses ALL request data
    // Buckets each request into the month when its status-relevant action occurred:
    //   APPROVED/COMPLETED/RETURNED → use approvedAt or createdAt
    //   REJECTED/CANCELLED → use createdAt (no separate rejectedAt field)
    //   PENDING → use createdAt
    const requestTrendData = useMemo(() => {
        if (!requests || requests.length === 0) return [];
        const now = new Date();
        const months = [];
        for (let i = numMonths - 1; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const monthName = monthStart.toLocaleString('default', { month: 'short' });

            // For each request, determine the relevant date and status bucket
            let approved = 0, rejected = 0, pending = 0, overdue = 0;
            requests.forEach(r => {
                // Pick the most relevant date for this request's current status
                let relevantDate;
                if (['APPROVED', 'COMPLETED', 'RETURNED'].includes(r.status)) {
                    relevantDate = new Date(r.approvedAt || r.createdAt || r.requestDate);
                } else {
                    relevantDate = new Date(r.createdAt || r.requestDate);
                }

                if (relevantDate >= monthStart && relevantDate < monthEnd) {
                    if (['APPROVED', 'COMPLETED', 'RETURNED'].includes(r.status)) {
                        approved++;
                    } else if (['REJECTED', 'CANCELLED'].includes(r.status)) {
                        rejected++;
                    } else if (r.status === 'PENDING') {
                        pending++;
                    }
                }

                // Overdue is bucketed by the month its return was due (not the
                // approval month), gated on the same backend `isOverdue` flag the
                // metric card and Requests page use, so the numbers stay in sync.
                if (r.isOverdue && r.expectedReturn) {
                    const returnDate = new Date(r.expectedReturn);
                    if (returnDate >= monthStart && returnDate < monthEnd) {
                        overdue++;
                    }
                }
            });

            const total = approved + rejected;
            months.push({
                month: monthName,
                approved,
                rejected,
                pending,
                overdue,
                approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
            });
        }
        return months;
    }, [requests, numMonths]);

    // Cumulative inventory trend with per-category breakdown
    const CATEGORY_COLORS = {
        'Electronics': '#1e40af',
        'Furniture': '#7c3aed',
        'Equipment': '#0891b2',
        'Supplies': '#ea580c',
        'Other': '#6b7280',
    };

    const inventoryTrendData = useMemo(() => {
        if (!inventory || inventory.length === 0) return { months: [], categories: [] };
        const now = new Date();
        const allCategories = [...new Set(inventory.map(item => {
            const cat = item.category || 'Other';
            return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        }))];
        const months = [];
        for (let i = numMonths - 1; i >= 0; i--) {
            const cutoff = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            const monthName = new Date(now.getFullYear(), now.getMonth() - i, 1)
                .toLocaleString('default', { month: 'short' });
            const entry = { month: monthName };
            entry.total = inventory.filter(item => {
                const d = new Date(item.createdAt || item.created_at || item.dateAdded);
                return d < cutoff;
            }).length;
            allCategories.forEach(cat => {
                entry[cat] = inventory.filter(item => {
                    const rawCat = item.category || 'Other';
                    const itemCat = rawCat.charAt(0).toUpperCase() + rawCat.slice(1).toLowerCase();
                    const d = new Date(item.createdAt || item.created_at || item.dateAdded);
                    return itemCat === cat && d < cutoff;
                }).length;
            });
            months.push(entry);
        }
        return { months, categories: allCategories };
    }, [inventory, numMonths]);

    const approvalRate = filteredStats.approvalRate;

    // Top requested items from filtered requests
    const popularItems = useMemo(() => {
        if (filteredRequests.length === 0) return [];
        const itemCounts = {};
        filteredRequests.forEach(r => {
            const name = r.itemName || 'Unknown';
            itemCounts[name] = (itemCounts[name] || 0) + r.quantity;
        });
        return Object.entries(itemCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [filteredRequests]);

    // Priority breakdown from filtered requests (matches selected date range)
    const priorityDistribution = useMemo(() => {
        if (!filteredRequests || filteredRequests.length === 0) return [];
        const counts = { LOW: 0, MEDIUM: 0, HIGH: 0 };
        filteredRequests.forEach(r => {
            const p = (r.priority || 'MEDIUM').toUpperCase();
            if (counts[p] !== undefined) counts[p]++;
        });
        return [
            { name: 'Low', value: counts.LOW },
            { name: 'Medium', value: counts.MEDIUM },
            { name: 'High', value: counts.HIGH },
        ].filter(d => d.value > 0);
    }, [filteredRequests]);

    // Overdue requests — uses the backend `isOverdue` flag (the single source of
    // truth shared with the Requests page and Dashboard) over ALL requests.
    // Overdue is a "current state" condition, so it must NOT be scoped by the
    // report's creation-date range: an overdue borrow is almost always an older
    // request, which the date filter would otherwise hide (showing a false 0).
    const overdueRequests = useMemo(() => {
        if (!requests || requests.length === 0) return [];
        const now = new Date();
        return requests
            .filter(r => r.isOverdue && r.expectedReturn)
            .map(r => {
                const { daysOverdue } = getOverdueAge(r.expectedReturn, now);
                return { ...r, daysOverdue };
            })
            .sort((a, b) => b.daysOverdue - a.daysOverdue);
    }, [requests]);

    const isLoading = inventoryLoading || requestsLoading;
    const periodLabel = { week: 'This Week', month: 'This Month', quarter: 'This Quarter', year: 'This Year', all: 'All Time' }[dateRange] || 'All Time';
    const chartsRef = useRef(null);
    const [exporting, setExporting] = useState(false);

    // ── CSV Export ──
    const exportCSV = () => {
        const exportInventory = dateRange === 'all' ? (inventory || []) : (filteredInventory || []);
        const exportRequests = dateRange === 'all' ? (requests || []) : (filteredRequests || []);

        const lines = [];
        lines.push([`PLMun Inventory Nexus — Report (${periodLabel})`]);
        lines.push(['Generated', new Date().toLocaleString()]);
        lines.push(['Period', periodLabel]);
        lines.push([]);

        // Summary
        const csvAvailable = exportInventory.filter(i => (i.status || '').toUpperCase() === 'AVAILABLE').length;
        const csvApproved = exportRequests.filter(r => r.status === 'APPROVED').length;
        lines.push(['=== SUMMARY ===']);
        lines.push(['Total Items', String(exportInventory.length)]);
        lines.push(['Available', String(csvAvailable)]);
        lines.push(['Total Requests', String(exportRequests.length)]);
        lines.push(['Approval Rate', (exportRequests.length > 0 ? Math.round(csvApproved / exportRequests.length * 100) : 0) + '%']);
        lines.push(['Overdue Returns', String(overdueRequests.length)]);
        lines.push([]);

        // Category Breakdown
        if (categoryDistribution.length > 0) {
            lines.push(['=== CATEGORY BREAKDOWN ===']);
            lines.push(['Category', 'Count', 'Percentage']);
            const totalInv = inventory.length;
            categoryDistribution.forEach(c => {
                lines.push([c.name, String(c.value), (totalInv > 0 ? Math.round(c.value / totalInv * 100) : 0) + '%']);
            });
            lines.push([]);
        }

        // Inventory
        lines.push(['=== INVENTORY ===']);
        lines.push(['#', 'Name', 'Category', 'Quantity', 'Status', 'Location']);
        exportInventory.forEach((item, idx) => {
            lines.push([String(idx + 1), item.name, item.category, String(item.quantity), item.status, item.location || '']);
        });
        lines.push([]);

        // Requests
        if (exportRequests.length > 0) {
            lines.push(['=== REQUESTS ===']);
            lines.push(['#', 'Item', 'Requested By', 'Quantity', 'Priority', 'Status', 'Date']);
            exportRequests.forEach((r, idx) => {
                lines.push([
                    String(idx + 1),
                    r.itemName || '', r.requestedBy || r.requested_by || '',
                    String(r.quantity || 0), r.priority || 'MEDIUM', r.status || '',
                    r.requestDate || r.created_at || '',
                ]);
            });
            lines.push([]);
        }

        // Priority Distribution
        if (priorityDistribution.length > 0) {
            lines.push(['=== PRIORITY DISTRIBUTION ===']);
            lines.push(['Priority', 'Count', 'Percentage']);
            const totalReq = requests.length;
            priorityDistribution.forEach(p => {
                lines.push([p.name, String(p.value), (totalReq > 0 ? Math.round(p.value / totalReq * 100) : 0) + '%']);
            });
            lines.push([]);
        }

        // Overdue
        if (overdueRequests.length > 0) {
            lines.push(['=== OVERDUE RETURNS ===']);
            lines.push(['Item', 'Borrower', 'Quantity', 'Expected Return', 'Days Overdue']);
            overdueRequests.forEach(r => {
                lines.push([r.itemName || '', r.requestedBy || '', String(r.quantity || 0), r.expectedReturn || '', String(r.daysOverdue)]);
            });
        }

        // Build CSV string
        const csvContent = lines.map(row =>
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PLMun_Report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── PDF Export ──
    const exportPDF = async () => {
        setExporting(true);
        try {
            // Portrait A4 for professional one-page-style report
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.width;
            const pageH = doc.internal.pageSize.height;
            const margin = 14;
            const contentW = pageW - margin * 2;
            const halfW = (contentW - 6) / 2; // 6mm gap between columns

            const fmtDate = (d) => {
                if (!d) return '—';
                const dt = new Date(d);
                return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            // Decide data scope
            const pdfItems = dateRange === 'all' ? (inventory || []) : (filteredInventory || []);
            const pdfRequests = dateRange === 'all' ? (requests || []) : (filteredRequests || []);
            const availableCount = pdfItems.filter(i => (i.status || '').toUpperCase() === 'AVAILABLE').length;
            const approvedCount = pdfRequests.filter(r => ['APPROVED', 'COMPLETED', 'RETURNED'].includes(r.status)).length;
            const rejectedCount = pdfRequests.filter(r => ['REJECTED', 'CANCELLED'].includes(r.status)).length;
            const decidedCount = approvedCount + rejectedCount;
            const rate = decidedCount > 0 ? Math.round(approvedCount / decidedCount * 100) : 0;

            // ─── Helper: Page Header ───
            const addPageHeader = (subtitle) => {
                // Purple accent bar
                doc.setFillColor(88, 28, 135);
                doc.rect(0, 0, pageW, 28, 'F');
                // Title
                doc.setFontSize(18);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(255);
                doc.text('PLMun Inventory Nexus', margin, 13);
                // Subtitle
                doc.setFontSize(9);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(216, 180, 254);
                doc.text(subtitle, margin, 21);
                // Right side info
                doc.setFontSize(8);
                doc.setTextColor(216, 180, 254);
                doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - margin, 13, { align: 'right' });
                doc.text(`Period: ${periodLabel}`, pageW - margin, 21, { align: 'right' });
            };

            // ─── Helper: Section Title ───
            const addSectionTitle = (title, yPos, accentColor = [88, 28, 135]) => {
                doc.setFillColor(...accentColor);
                doc.rect(margin, yPos, 3, 6, 'F');
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(33, 37, 41);
                doc.text(title, margin + 6, yPos + 5);
                return yPos + 10;
            };

            // ════════════════════════════════════════
            //  PAGE 1: Summary Dashboard
            // ════════════════════════════════════════
            addPageHeader('Inventory Stock Status Report');
            let y = 36;

            // Institution info
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100);
            doc.text('Pamantasan ng Lungsod ng Muntinlupa', margin, y);
            doc.text('Inventory Management System', margin, y + 5);
            y += 14;

            // ── Summary Cards ──
            const cards = [
                { label: 'Total Quantity\nin Hand', value: String(pdfItems.length), color: [88, 28, 135] },
                { label: 'Total Available\nQuantity', value: String(availableCount), color: [16, 163, 127] },
                { label: 'Total\nRequests', value: String(pdfRequests.length), color: [59, 130, 246] },
                { label: 'Approval\nRate', value: `${rate}%`, color: [234, 88, 12] },
            ];
            const cardW = (contentW - 3 * 6) / 4;
            cards.forEach((card, i) => {
                const x = margin + i * (cardW + 6);
                // Card background
                doc.setFillColor(248, 245, 252);
                doc.roundedRect(x, y, cardW, 22, 2, 2, 'F');
                // Top accent line
                doc.setFillColor(...card.color);
                doc.rect(x, y, cardW, 1.5, 'F');
                // Value
                doc.setFontSize(18);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(...card.color);
                doc.text(card.value, x + cardW / 2, y + 10, { align: 'center' });
                // Label
                doc.setFontSize(7);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(120);
                const lines = card.label.split('\n');
                lines.forEach((line, li) => {
                    doc.text(line, x + cardW / 2, y + 15 + li * 3.5, { align: 'center' });
                });
            });
            y += 30;

            // ── Category Breakdown (left) + Item Status (right) ──
            y = addSectionTitle('Inventory Breakdown', y);

            const catTableStartY = y;
            if (categoryDistribution.length > 0) {
                autoTable(doc, {
                    head: [['Category', 'Count', '%']],
                    body: categoryDistribution.map(c => [
                        c.name, String(c.value),
                        `${pdfItems.length > 0 ? Math.round(c.value / pdfItems.length * 100) : 0}%`,
                    ]),
                    startY: catTableStartY,
                    theme: 'grid',
                    headStyles: { fillColor: [88, 28, 135], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2 },
                    bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 1.8 },
                    alternateRowStyles: { fillColor: [248, 245, 252] },
                    styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                    margin: { left: margin, right: pageW - margin - halfW },
                    tableWidth: halfW,
                });
            }

            const statusCounts = {};
            pdfItems.forEach(item => { const s = item.status || 'Unknown'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
            if (Object.keys(statusCounts).length > 0) {
                autoTable(doc, {
                    head: [['Status', 'Count', '%']],
                    body: Object.entries(statusCounts).map(([s, c]) => [
                        s, String(c), `${Math.round(c / pdfItems.length * 100)}%`,
                    ]),
                    startY: catTableStartY,
                    theme: 'grid',
                    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2 },
                    bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 1.8 },
                    alternateRowStyles: { fillColor: [239, 246, 255] },
                    styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                    margin: { left: margin + halfW + 6, right: margin },
                    tableWidth: halfW,
                });
            }

            // ── Request Status (left) + Priority (right) ──
            const row2Y = (doc.lastAutoTable?.finalY || y + 30) + 8;
            if (pdfRequests.length > 0) {
                const r2Start = addSectionTitle('Request Breakdown', row2Y);
                const reqStatusCounts = {};
                pdfRequests.forEach(r => { const s = r.status || 'Unknown'; reqStatusCounts[s] = (reqStatusCounts[s] || 0) + 1; });

                autoTable(doc, {
                    head: [['Status', 'Count', '%']],
                    body: Object.entries(reqStatusCounts).map(([s, c]) => [
                        s, String(c), `${Math.round(c / pdfRequests.length * 100)}%`,
                    ]),
                    startY: r2Start,
                    theme: 'grid',
                    headStyles: { fillColor: [16, 163, 127], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2 },
                    bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 1.8 },
                    alternateRowStyles: { fillColor: [240, 253, 244] },
                    styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                    margin: { left: margin, right: pageW - margin - halfW },
                    tableWidth: halfW,
                });

                if (priorityDistribution.length > 0) {
                    autoTable(doc, {
                        head: [['Priority', 'Count', '%']],
                        body: priorityDistribution.map(p => [
                            p.name, String(p.value), `${Math.round(p.value / pdfRequests.length * 100)}%`,
                        ]),
                        startY: r2Start,
                        theme: 'grid',
                        headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2 },
                        bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 1.8 },
                        alternateRowStyles: { fillColor: [255, 247, 237] },
                        styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                        margin: { left: margin + halfW + 6, right: margin },
                        tableWidth: halfW,
                    });
                }
            }

            // ════════════════════════════════════════
            //  PAGE 2: Inventory Items
            // ════════════════════════════════════════
            doc.addPage();
            addPageHeader(`Inventory Items — ${pdfItems.length} Records`);

            autoTable(doc, {
                head: [['#', 'Item Name', 'Category', 'Qty', 'Status', 'Location']],
                body: pdfItems.map((item, idx) => [
                    String(idx + 1), item.name || '', item.category || '',
                    String(item.quantity || 0), item.status || '', item.location || '',
                ]),
                startY: 34,
                theme: 'grid',
                headStyles: { fillColor: [88, 28, 135], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
                bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 2 },
                alternateRowStyles: { fillColor: [248, 245, 252] },
                styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                columnStyles: { 0: { cellWidth: 10 }, 3: { cellWidth: 12, halign: 'center' } },
                margin: { left: margin, right: margin },
            });

            // ════════════════════════════════════════
            //  PAGE 3: Requests
            // ════════════════════════════════════════
            if (pdfRequests.length > 0) {
                doc.addPage();
                addPageHeader(`Borrowing Requests — ${pdfRequests.length} Records`);

                autoTable(doc, {
                    head: [['#', 'Item', 'Requested By', 'Qty', 'Priority', 'Status', 'Date', 'Return Date']],
                    body: pdfRequests.map((r, idx) => [
                        String(idx + 1), r.itemName || '', r.requestedBy || '',
                        String(r.quantity || 0), r.priority || 'NORMAL', r.status || '',
                        fmtDate(r.requestDate || r.createdAt), fmtDate(r.expectedReturn),
                    ]),
                    startY: 34,
                    theme: 'grid',
                    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
                    bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 2 },
                    alternateRowStyles: { fillColor: [239, 246, 255] },
                    styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                    columnStyles: { 0: { cellWidth: 8 }, 3: { cellWidth: 10, halign: 'center' } },
                    margin: { left: margin, right: margin },
                });
            }

            // ════════════════════════════════════════
            //  PAGE 4: Overdue Returns (if any)
            // ════════════════════════════════════════
            if (overdueRequests.length > 0) {
                doc.addPage();
                addPageHeader(`Overdue Returns — ${overdueRequests.length} Items`);

                // Warning banner
                let oy = 34;
                doc.setFillColor(254, 242, 242);
                doc.roundedRect(margin, oy, contentW, 10, 2, 2, 'F');
                doc.setFontSize(8);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(185, 28, 28);
                doc.text(`⚠ ${overdueRequests.length} item(s) are past their expected return date and require immediate attention.`, margin + 4, oy + 6.5);
                oy += 14;

                autoTable(doc, {
                    head: [['Item', 'Borrower', 'Qty', 'Expected Return', 'Days Overdue']],
                    body: overdueRequests.map(r => [
                        r.itemName || '',
                        r.requestedBy || '',
                        String(r.quantity || 0),
                        fmtDate(r.expectedReturn),
                        String(r.daysOverdue),
                    ]),
                    startY: oy,
                    theme: 'grid',
                    headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold', fontSize: 8, cellPadding: 2.5 },
                    bodyStyles: { fontSize: 7.5, textColor: [50, 50, 50], cellPadding: 2 },
                    alternateRowStyles: { fillColor: [254, 242, 242] },
                    styles: { lineColor: [220, 220, 220], lineWidth: 0.2 },
                    margin: { left: margin, right: margin },
                });
            }

            // ── Footer on all pages ──
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                // Bottom accent line
                doc.setFillColor(88, 28, 135);
                doc.rect(0, pageH - 12, pageW, 0.5, 'F');
                doc.setFontSize(7);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(150);
                doc.text(`Page ${i} of ${pageCount}`, margin, pageH - 6);
                doc.text('PLMun Inventory Nexus — Confidential', pageW / 2, pageH - 6, { align: 'center' });
                doc.text(new Date().toLocaleDateString(), pageW - margin, pageH - 6, { align: 'right' });
            }

            // Save
            const filename = `PLMun_Inventory_Report_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(filename);
        } catch (err) {
            alert('Failed to export PDF: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    // ── Export dispatcher ──
    const handleExport = (format) => {
        if (format === 'csv') {
            exportCSV();
        } else {
            exportPDF();
        }
    };

    return (
        <StaffOnly redirectTo="/requests" showAccessDenied>
            <div className="space-y-6">
                <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-700/50 dark:bg-gray-800/50">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Reports</p>
                            <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Operational analytics</h1>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                                Quick inventory, request, and return insights for {periodLabel.toLowerCase()}.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="inline-flex rounded-2xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-900/40">
                                {RANGE_OPTIONS.map(option => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setDateRange(option.value)}
                                        className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${dateRange === option.value
                                            ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                                            : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-2">
                                <Button type="button" variant="ghost" onClick={(e) => { e.stopPropagation(); handleExport('csv'); }} className="gap-2">
                                    <Download size={16} />
                                    CSV
                                </Button>
                                <Button type="button" onClick={(e) => { e.stopPropagation(); handleExport('pdf'); }} className="gap-2" disabled={exporting}>
                                    {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                    {exporting ? 'Exporting' : 'PDF'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </section>

                {isLoading ? (
                    <Card className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="ml-3 text-sm font-medium text-gray-500 dark:text-gray-400">Loading report data...</span>
                    </Card>
                ) : (
                    <>
                        <div ref={chartsRef} className="grid grid-cols-1 gap-6 xl:grid-cols-[290px_minmax(0,1fr)]">
                            <aside className="space-y-4">
                                <ReportMetricCard icon={Package} value={filteredStats.totalItems} label="Items tracked" hint={periodLabel} />
                                <ReportMetricCard icon={CheckCircle} value={filteredStats.availableItems} label="Available items" hint="Ready for borrowing" tone="emerald" />
                                <ReportMetricCard icon={ClipboardText} value={filteredStats.totalRequests} label="Borrow requests" hint={periodLabel} tone="blue" />
                                <ReportMetricCard icon={ChartLineUp} value={`${approvalRate}%`} label="Approval rate" hint="Approved vs decided" tone="amber" />
                                <ReportMetricCard icon={AlertTriangle} value={overdueRequests.length} label="Overdue returns" hint="Needs follow-up" tone={overdueRequests.length ? 'red' : 'emerald'} />
                            </aside>

                            <main className="space-y-6">
                                <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-card dark:border-gray-700/50 dark:bg-gray-800/50">
                                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                        <SectionTitle
                                            kicker="Primary insight"
                                            title="Request performance"
                                            description="A prominent view of approved, pending, and rejected activity."
                                        />
                                        <span className="inline-flex self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                            {periodLabel}
                                        </span>
                                    </div>
                                    <BarChartComponent
                                        data={requestTrendData}
                                        bars={[
                                            { dataKey: 'approved', name: 'Approved', color: '#10b981' },
                                            { dataKey: 'rejected', name: 'Rejected', color: '#ef4444' },
                                            { dataKey: 'pending', name: 'Pending', color: '#f59e0b' },
                                            { dataKey: 'overdue', name: 'Overdue', color: '#b91c1c' },
                                        ]}
                                        xAxisKey="month"
                                        title=""
                                    />
                                </section>

                                <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                                    <div>
                                        <SectionTitle
                                            kicker="Inventory"
                                            title="Stock growth by category"
                                            description="Cumulative inventory by category over the selected range."
                                        />
                                        <div className="mt-4">
                                            <LineChartComponent
                                                data={inventoryTrendData.months || []}
                                                lines={[
                                                    ...(inventoryTrendData.categories || []).map(cat => ({
                                                        dataKey: cat,
                                                        name: cat.charAt(0) + cat.slice(1).toLowerCase(),
                                                    }))
                                                ]}
                                                xAxisKey="month"
                                                title=""
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <SectionTitle
                                            kicker="Distribution"
                                            title="Items by category"
                                            description="Supplementary detail for where inventory is concentrated."
                                        />
                                        <div className="mt-4">
                                            {categoryDistribution.length > 0 ? (
                                                <PieChartComponent data={categoryDistribution} dataKey="value" nameKey="name" title="" />
                                            ) : (
                                                <EmptyPanel icon={Package} title="No inventory data" message="Add inventory items to populate this chart." />
                                            )}
                                        </div>
                                    </div>
                                </section>

                                <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                                    <div className="lg:col-span-2">
                                        {popularItems.length > 0 ? (
                                            <BarChartComponent
                                                data={popularItems}
                                                bars={[{ dataKey: 'count', name: 'Times Requested', color: '#6366f1' }]}
                                                xAxisKey="name"
                                                title="Most requested items"
                                            />
                                        ) : (
                                            <EmptyPanel icon={BarChart2} title="No request demand yet" message="Submitted requests will reveal popular items here." />
                                        )}
                                    </div>
                                    <div>
                                        {priorityDistribution.length > 0 ? (
                                            <PieChartComponent data={priorityDistribution} dataKey="value" nameKey="name" title="Requests by priority" />
                                        ) : (
                                            <EmptyPanel icon={AlertTriangle} title="No priority data" message="Priority usage appears after requests are submitted." />
                                        )}
                                    </div>
                                </section>
                            </main>
                        </div>

                        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                            <Card className={overdueRequests.length ? 'border-red-200 dark:border-red-900/50' : ''}>
                                <Card.Header>
                                    <Card.Title className="flex items-center gap-2">
                                        <AlertTriangle className={overdueRequests.length ? 'text-red-500' : 'text-emerald-500'} size={20} weight="duotone" />
                                        Overdue returns
                                    </Card.Title>
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${overdueRequests.length ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                        {overdueRequests.length}
                                    </span>
                                </Card.Header>
                                <Card.Content>
                                    {overdueRequests.length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-gray-100 dark:border-gray-700/50">
                                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Item</th>
                                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Borrower</th>
                                                        <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Qty</th>
                                                        <th className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300">Expected Return</th>
                                                        <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">Late</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {overdueRequests.map((req) => (
                                                        <tr key={req.id} className="border-b border-gray-50 hover:bg-red-50/30 dark:border-gray-800 dark:hover:bg-red-900/10">
                                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{req.itemName}</td>
                                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{req.requestedBy}</td>
                                                            <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{req.quantity}</td>
                                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{req.expectedReturn}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${req.daysOverdue > 7 ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                                                                    req.daysOverdue > 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' :
                                                                        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                                                                    }`}>
                                                                    {req.daysOverdue}d
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="py-10 text-center">
                                            <CheckCircle size={36} weight="duotone" className="mx-auto text-emerald-500" />
                                            <p className="mt-2 font-semibold text-gray-700 dark:text-gray-200">No overdue returns</p>
                                            <p className="text-sm text-gray-400 dark:text-gray-500">All active borrow records are within their expected return date.</p>
                                        </div>
                                    )}
                                </Card.Content>
                            </Card>

                            <Card>
                                <Card.Header>
                                    <Card.Title>Category summary</Card.Title>
                                </Card.Header>
                                <Card.Content>
                                    {categoryDistribution.length > 0 ? (
                                        <div className="space-y-3">
                                            {categoryDistribution.map((cat) => {
                                                const percent = inventory.length > 0 ? Math.round(cat.value / inventory.length * 100) : 0;
                                                return (
                                                    <div key={cat.name}>
                                                        <div className="mb-1 flex items-center justify-between text-sm">
                                                            <span className="font-medium text-gray-700 dark:text-gray-200">{cat.name}</span>
                                                            <span className="text-gray-500 dark:text-gray-400">{cat.value} ({percent}%)</span>
                                                        </div>
                                                        <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700/60">
                                                            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">No category data available.</p>
                                    )}
                                </Card.Content>
                            </Card>
                        </section>
                    </>
                )}
            </div>
        </StaffOnly>
    );
};

export default Reports;
