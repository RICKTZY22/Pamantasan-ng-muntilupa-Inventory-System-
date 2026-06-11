export const normalizeRequestBorrower = (request = {}) => {
    const borrower = request.borrower || {};
    return {
        id: borrower.id ?? request.requestedById ?? null,
        fullName: borrower.fullName || request.requestedBy || 'Unknown borrower',
        username: borrower.username || '',
        email: borrower.email || '',
        studentId: borrower.studentId || request.requestedByStudentId || '',
        role: borrower.role || '',
        department: borrower.department || '',
        avatarUrl: borrower.avatarUrl || '',
        isActive: borrower.isActive ?? true,
        isFlagged: borrower.isFlagged ?? false,
        overdueCount: borrower.overdueCount ?? 0,
        creditScore: borrower.creditScore ?? null,
        earlyReturnCount: borrower.earlyReturnCount ?? 0,
    };
};

export const getCreditTone = (score) => {
    if (score === null || score === undefined) return 'neutral';
    if (score <= 75) return 'danger';
    if (score < 100) return 'warning';
    return 'good';
};
