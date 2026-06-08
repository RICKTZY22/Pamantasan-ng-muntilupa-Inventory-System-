export const FINAL_REQUEST_STATUSES = ['COMPLETED', 'RETURNED'];

export const canStartReturn = (request, isOwn, isStaffPlus) => (
    request?.status === 'APPROVED'
    && request?.isReturnable
    && (isOwn || isStaffPlus)
);

export const canCompleteRequest = (request, isStaffPlus) => (
    request?.status === 'APPROVED'
    && !request?.isReturnable
    && isStaffPlus
);

export const buildRequestTabParams = ({ activeTab, viewMode, search = '' }) => {
    const params = { mine: viewMode === 'mine', search };
    if (activeTab === 'OVERDUE') params.overdue = true;
    else if (activeTab === 'COMPLETED') params.completed = true;
    else if (activeTab && activeTab !== 'ALL') params.status = activeTab;
    return params;
};
