import { format, isBefore, isValid, parseISO } from 'date-fns';

export const ACTIVE_DUE_STATUSES = new Set(['APPROVED', 'RETURN_PENDING']);

const parseDate = (value) => {
    if (!value) return null;
    const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);
    return isValid(parsed) ? parsed : null;
};

const isCleared = (request) => Boolean(request?.isCleared || request?.is_cleared);

export const isActiveDueRequest = (request) => {
    if (!request || isCleared(request)) return false;
    if (!ACTIVE_DUE_STATUSES.has(request.status)) return false;
    if (!request.isReturnable) return false;
    return Boolean(parseDate(request.expectedReturn));
};

const borrowerName = (request) => (
    request?.borrower?.fullName
    || request?.requestedBy
    || request?.requester_name
    || request?.requested_by_name
    || 'Unknown borrower'
);

export const buildDueCalendarEvents = (requests = [], { includeBorrower = false, now = new Date() } = {}) => (
    requests
        .filter(isActiveDueRequest)
        .map((request) => {
            const dueDate = parseDate(request.expectedReturn);
            const itemName = request.itemName || request.item_name || 'Item';
            const overdue = Boolean(request.isOverdue) || isBefore(dueDate, now);

            return {
                id: request.id,
                requestId: request.id,
                dueDate,
                dayKey: format(dueDate, 'yyyy-MM-dd'),
                itemName,
                borrowerName: includeBorrower ? borrowerName(request) : '',
                quantity: request.quantity || 1,
                status: request.status,
                isOverdue: overdue,
            };
        })
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
);
