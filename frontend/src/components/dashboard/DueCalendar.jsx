import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { CalendarBlank, CaretLeft, CaretRight, Clock, WarningCircle } from '@phosphor-icons/react';
import { Card } from '../ui';

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dayKey = (date) => format(date, 'yyyy-MM-dd');

const DueCalendar = ({
    title = 'Due Calendar',
    events,
    emptyMessage = 'No active due dates',
    showBorrower = false,
}) => {
    const initialDate = events[0]?.dueDate || new Date();
    const [monthDate, setMonthDate] = useState(startOfMonth(initialDate));
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const hydratedEvents = useRef(false);

    useEffect(() => {
        if (!hydratedEvents.current && events.length > 0) {
            setMonthDate(startOfMonth(events[0].dueDate));
            setSelectedDate(events[0].dueDate);
            hydratedEvents.current = true;
        }
        if (events.length === 0) {
            hydratedEvents.current = false;
        }
    }, [events]);

    const monthDays = useMemo(() => (
        eachDayOfInterval({
            start: startOfWeek(startOfMonth(monthDate)),
            end: endOfWeek(endOfMonth(monthDate)),
        })
    ), [monthDate]);

    const eventsByDay = useMemo(() => {
        const grouped = new Map();
        for (const event of events) {
            const key = event.dayKey || dayKey(event.dueDate);
            const list = grouped.get(key) || [];
            list.push(event);
            grouped.set(key, list);
        }
        return grouped;
    }, [events]);

    const selectedEvents = eventsByDay.get(dayKey(selectedDate)) || [];
    const monthEventCount = events.filter((event) => isSameMonth(event.dueDate, monthDate)).length;
    const overdueCount = events.filter((event) => event.isOverdue).length;

    const shiftMonth = (offset) => {
        const next = offset > 0 ? addMonths(monthDate, 1) : subMonths(monthDate, 1);
        setMonthDate(next);
        setSelectedDate(startOfMonth(next));
    };

    return (
        <Card>
            <Card.Header className="items-start gap-3">
                <div className="min-w-0">
                    <Card.Title className="flex items-center gap-2">
                        <CalendarBlank size={18} weight="duotone" className="text-emerald-500" />
                        {title}
                    </Card.Title>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {monthEventCount ? `${monthEventCount} due this month` : 'No due dates this month'}
                        {overdueCount > 0 ? ` - ${overdueCount} overdue` : ''}
                    </p>
                </div>
                <div className="flex flex-none items-center gap-1">
                    <button
                        type="button"
                        onClick={() => shiftMonth(-1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label="Previous month"
                    >
                        <CaretLeft size={15} weight="bold" />
                    </button>
                    <button
                        type="button"
                        onClick={() => shiftMonth(1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label="Next month"
                    >
                        <CaretRight size={15} weight="bold" />
                    </button>
                </div>
            </Card.Header>

            <Card.Content>
                <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {format(monthDate, 'MMMM yyyy')}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            const today = new Date();
                            setMonthDate(startOfMonth(today));
                            setSelectedDate(today);
                        }}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-300"
                    >
                        Today
                    </button>
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {WEEK_DAYS.map((label, index) => (
                        <div key={`${label}-${index}`} className="h-6 text-center text-[11px] font-semibold text-gray-400">
                            {label}
                        </div>
                    ))}
                    {monthDays.map((day) => {
                        const key = dayKey(day);
                        const dayEvents = eventsByDay.get(key) || [];
                        const selected = isSameDay(day, selectedDate);
                        const muted = !isSameMonth(day, monthDate);
                        const hasOverdue = dayEvents.some((event) => event.isOverdue);
                        const hasEvents = dayEvents.length > 0;

                        return (
                            <button
                                type="button"
                                key={key}
                                onClick={() => setSelectedDate(day)}
                                className={[
                                    'relative flex h-10 w-full items-start justify-center rounded-lg border pt-1.5 text-xs font-semibold transition-colors',
                                    selected
                                        ? 'border-emerald-500 bg-emerald-600 text-white'
                                        : 'border-transparent text-gray-700 hover:border-emerald-200 hover:bg-emerald-50 dark:text-gray-200 dark:hover:border-emerald-900/60 dark:hover:bg-emerald-900/20',
                                    muted ? 'opacity-40' : '',
                                    !selected && isToday(day) ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300' : '',
                                ].join(' ')}
                                aria-label={`${format(day, 'MMMM d')} - ${dayEvents.length} due event${dayEvents.length === 1 ? '' : 's'}`}
                            >
                                <span>{format(day, 'd')}</span>
                                {hasEvents && (
                                    <span className="absolute bottom-1.5 flex items-center gap-0.5">
                                        {dayEvents.slice(0, 3).map((event) => (
                                            <span
                                                key={`${event.requestId}-${event.status}`}
                                                className={[
                                                    'h-1.5 w-1.5 rounded-full',
                                                    selected
                                                        ? 'bg-white'
                                                        : hasOverdue
                                                            ? 'bg-red-500'
                                                            : 'bg-amber-500',
                                                ].join(' ')}
                                            />
                                        ))}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-700/60">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {format(selectedDate, 'MMM d')}
                        </p>
                        {selectedEvents.length > 0 && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                {selectedEvents.length} due
                            </span>
                        )}
                    </div>

                    {selectedEvents.length === 0 ? (
                        <div className="py-5 text-center">
                            <Clock size={28} weight="duotone" className="mx-auto mb-1.5 text-gray-300 dark:text-gray-600" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
                        </div>
                    ) : (
                        <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                            {selectedEvents.map((event) => {
                                const Icon = event.isOverdue ? WarningCircle : Clock;
                                return (
                                    <div
                                        key={`${event.requestId}-${event.status}-${event.dayKey}`}
                                        className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2.5 dark:border-gray-700/60 dark:bg-gray-800/60"
                                    >
                                        <span className={[
                                            'flex h-9 w-9 flex-none items-center justify-center rounded-lg',
                                            event.isOverdue
                                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                                                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
                                        ].join(' ')}>
                                            <Icon size={18} weight="duotone" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                {event.itemName}
                                            </p>
                                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                                {showBorrower && event.borrowerName
                                                    ? `${event.borrowerName} - Qty ${event.quantity}`
                                                    : `Qty ${event.quantity}`}
                                            </p>
                                        </div>
                                        <span className={[
                                            'flex-none rounded-full px-2 py-1 text-[11px] font-bold',
                                            event.isOverdue
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                                        ].join(' ')}>
                                            {event.isOverdue ? 'Overdue' : event.status === 'RETURN_PENDING' ? 'Pending' : 'Due'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Card.Content>
        </Card>
    );
};

DueCalendar.propTypes = {
    title: PropTypes.string,
    emptyMessage: PropTypes.string,
    showBorrower: PropTypes.bool,
    events: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        requestId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        dueDate: PropTypes.instanceOf(Date).isRequired,
        dayKey: PropTypes.string,
        itemName: PropTypes.string,
        borrowerName: PropTypes.string,
        quantity: PropTypes.number,
        status: PropTypes.string,
        isOverdue: PropTypes.bool,
    })).isRequired,
};

export default DueCalendar;
