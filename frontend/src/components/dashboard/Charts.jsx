// Charts.jsx - RECHARTS WRAPPER COMPONENTS for Dashboard and Reports
// Reusable chart components: BarChart, LineChart, AreaChart, PieChart
// Diverse color palette with entrance animations

import React from 'react';
import PropTypes from 'prop-types';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    Legend,
    Area,
    AreaChart,
} from 'recharts';

// Diverse, curated palette — each color is visually distinct
const COLORS = [
    '#4f46e5', // indigo
    '#0891b2', // cyan
    '#059669', // emerald
    '#d97706', // amber
    '#dc2626', // red
    '#7c3aed', // violet
    '#0284c7', // sky
    '#c026d3', // fuchsia
    '#65a30d', // lime
    '#ea580c', // orange
];

// Shared axis styling
const axisStyle = { fontSize: 11, fill: '#94a3b8', fontWeight: 400 };

// Chart card wrapper with entrance animation
const ChartCard = ({ title, children }) => (
    <div
        className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 p-5 animate-fade-in-up animate-fill-both"
        style={{ animationDuration: '0.5s' }}
    >
        {title && (
            <h3 className="text-[13px] font-medium text-gray-700 dark:text-gray-300 mb-4 tracking-tight">{title}</h3>
        )}
        {children}
    </div>
);

ChartCard.propTypes = {
    title: PropTypes.string,
    children: PropTypes.node,
};

// Dark-mode aware tooltip
const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    const isDark = document.documentElement.classList.contains('dark');
    return (
        <div
            style={{
                background: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.98)',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                borderRadius: 10,
                padding: '10px 14px',
                boxShadow: isDark
                    ? '0 4px 12px rgba(0,0,0,0.4)'
                    : '0 4px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
            }}
        >
            <p style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#e2e8f0' : '#1e293b', margin: 0, marginBottom: 6, letterSpacing: '-0.01em' }}>
                {label}
            </p>
            {payload.map((entry) => (
                <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b' }}>
                        {entry.name}:
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#f1f5f9' : '#0f172a' }}>
                        {entry.value}
                    </span>
                </div>
            ))}
        </div>
    );
};

CustomTooltip.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.arrayOf(PropTypes.object),
    label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

// Legend formatter
const LegendFormatter = (value) => (
    <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{value}</span>
);

// ─── Bar Chart ──────────────────────────────────────────────
export const BarChartComponent = ({ data, dataKey, bars, xAxisKey, title }) => (
    <ChartCard title={title}>
        <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barGap={4} barCategoryGap="25%">
                <defs>
                    {COLORS.map((color, i) => (
                        <linearGradient key={`barGrad-${i}`} id={`barGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.65} />
                        </linearGradient>
                    ))}
                </defs>
                <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="" />
                <XAxis dataKey={xAxisKey} tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
                {bars ? (
                    <>
                        <Legend verticalAlign="top" height={28} formatter={LegendFormatter} />
                        {bars.map((bar, index) => (
                            <Bar
                                key={bar.dataKey}
                                dataKey={bar.dataKey}
                                name={bar.name || bar.dataKey}
                                fill={bar.color || `url(#barGrad-${index % COLORS.length})`}
                                radius={[6, 6, 0, 0]}
                                maxBarSize={38}
                                animationDuration={800}
                                animationEasing="ease-out"
                            >
                                {/* Single series, no explicit color → one palette color per category. */}
                                {bars.length === 1 && !bar.color &&
                                    data.map((entry, i) => (
                                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                                    ))}
                            </Bar>
                        ))}
                    </>
                ) : (
                    <Bar
                        dataKey={dataKey}
                        fill="url(#barGrad-0)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={38}
                        animationDuration={800}
                        animationEasing="ease-out"
                    />
                )}
            </BarChart>
        </ResponsiveContainer>
    </ChartCard>
);

BarChartComponent.propTypes = {
    data: PropTypes.arrayOf(PropTypes.object),
    dataKey: PropTypes.string,
    bars: PropTypes.arrayOf(PropTypes.shape({
        dataKey: PropTypes.string.isRequired,
        name: PropTypes.string,
        color: PropTypes.string,
    })),
    xAxisKey: PropTypes.string,
    title: PropTypes.string,
};

// ─── Line Chart ─────────────────────────────────────────────
export const LineChartComponent = ({ data, lines, xAxisKey, title }) => (
    <ChartCard title={title}>
        <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="" />
                <XAxis dataKey={xAxisKey} tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={LegendFormatter} />
                {lines.map((line, index) => (
                    <Line
                        key={line.dataKey}
                        type="monotone"
                        dataKey={line.dataKey}
                        stroke={COLORS[index % COLORS.length]}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: COLORS[index % COLORS.length] }}
                        name={line.name || line.dataKey}
                        animationDuration={1000}
                        animationEasing="ease-out"
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    </ChartCard>
);

LineChartComponent.propTypes = {
    data: PropTypes.arrayOf(PropTypes.object),
    lines: PropTypes.arrayOf(PropTypes.shape({
        dataKey: PropTypes.string.isRequired,
        name: PropTypes.string,
    })),
    xAxisKey: PropTypes.string,
    title: PropTypes.string,
};

// ─── Area Chart ─────────────────────────────────────────────
// Supports a single `dataKey`+`color` (back-compat) OR a `series` array of
// { dataKey, name, color } to render overlapping gradient waves with a legend.
export const AreaChartComponent = ({ data, dataKey, xAxisKey, title, color = COLORS[0], series }) => {
    const areas = series && series.length > 0
        ? series
        : [{ dataKey, name: dataKey, color }];
    const gradId = (key) => `areaGrad-${key}`;
    return (
        <ChartCard title={title}>
            <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={data}>
                    <defs>
                        {areas.map((a) => (
                            <linearGradient key={a.dataKey} id={gradId(a.dataKey)} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={a.color} stopOpacity={0.25} />
                                <stop offset="95%" stopColor={a.color} stopOpacity={0.01} />
                            </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" strokeDasharray="" />
                    <XAxis dataKey={xAxisKey} tick={axisStyle} axisLine={false} tickLine={false} />
                    <YAxis tick={axisStyle} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                    <Tooltip content={<CustomTooltip />} />
                    {series && series.length > 0 && (
                        <Legend verticalAlign="top" height={28} formatter={LegendFormatter} />
                    )}
                    {areas.map((a) => (
                        <Area
                            key={a.dataKey}
                            type="monotone"
                            dataKey={a.dataKey}
                            name={a.name || a.dataKey}
                            stroke={a.color}
                            fill={`url(#${gradId(a.dataKey)})`}
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff', fill: a.color }}
                            animationDuration={1000}
                            animationEasing="ease-out"
                        />
                    ))}
                </AreaChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

AreaChartComponent.propTypes = {
    data: PropTypes.arrayOf(PropTypes.object),
    dataKey: PropTypes.string,
    xAxisKey: PropTypes.string,
    title: PropTypes.string,
    color: PropTypes.string,
    series: PropTypes.arrayOf(PropTypes.shape({
        dataKey: PropTypes.string.isRequired,
        name: PropTypes.string,
        color: PropTypes.string,
    })),
};

// ─── Pie Tooltip ────────────────────────────────────────────
const PieTooltipContent = ({ active, payload, total }) => {
    if (!active || !payload?.[0]) return null;
    const item = payload[0];
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
    const isDark = document.documentElement.classList.contains('dark');
    return (
        <div
            style={{
                background: isDark ? 'rgba(30,41,59,0.95)' : 'rgba(255,255,255,0.98)',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                borderRadius: 10,
                padding: '10px 14px',
                boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.06)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: item.payload.fill, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? '#e2e8f0' : '#1e293b' }}>{item.name}</span>
            </div>
            <p style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', margin: 0 }}>
                {item.value} items · {pct}%
            </p>
        </div>
    );
};

PieTooltipContent.propTypes = {
    active: PropTypes.bool,
    payload: PropTypes.arrayOf(PropTypes.object),
    total: PropTypes.number,
};

// ─── Pie Chart ──────────────────────────────────────────────
export const PieChartComponent = ({ data, dataKey, nameKey, title }) => {
    const safeData = Array.isArray(data) ? data : [];
    const total = safeData.reduce((sum, entry) => sum + (entry[dataKey] || 0), 0);

    if (safeData.length === 0 || total === 0) {
        return (
            <ChartCard title={title}>
                <div className="flex flex-col items-center justify-center h-[280px] text-gray-300 dark:text-gray-600">
                    <svg className="w-10 h-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                    </svg>
                    <p className="text-sm text-gray-400 dark:text-gray-500">No data available</p>
                </div>
            </ChartCard>
        );
    }

    const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }) => {
        if (total === 0) return null;
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);
        const percent = ((safeData[index]?.[dataKey] || 0) / total * 100).toFixed(0);
        if (percent < 5) return null;
        return (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={500}>
                {percent}%
            </text>
        );
    };

    const pieLegendFormatter = (value) => {
        const item = safeData.find(d => d[nameKey] === value);
        const pct = item && total > 0 ? ((item[dataKey] / total) * 100).toFixed(0) : 0;
        return <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>{value} ({pct}%)</span>;
    };

    return (
        <ChartCard title={title}>
            <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                    <Pie
                        data={safeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={3}
                        dataKey={dataKey}
                        nameKey={nameKey}
                        label={renderLabel}
                        labelLine={false}
                        stroke="none"
                        animationDuration={800}
                        animationEasing="ease-out"
                    >
                        {safeData.map((entry, index) => (
                            <Cell key={entry[nameKey] || `cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                    </Pie>
                    <Tooltip content={<PieTooltipContent total={total} />} />
                    <Legend
                        verticalAlign="bottom"
                        height={28}
                        formatter={pieLegendFormatter}
                    />
                </PieChart>
            </ResponsiveContainer>
        </ChartCard>
    );
};

PieChartComponent.propTypes = {
    data: PropTypes.arrayOf(PropTypes.object),
    dataKey: PropTypes.string,
    nameKey: PropTypes.string,
    title: PropTypes.string,
};

export default {
    Bar: BarChartComponent,
    Line: LineChartComponent,
    Area: AreaChartComponent,
    Pie: PieChartComponent,
};
