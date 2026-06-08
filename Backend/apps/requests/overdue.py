"""Overdue scan logic, extracted from the viewset so it can be reused by both
the HTTP action (on page load) and the `check_overdue` management command
(scheduled via Task Scheduler / cron)."""

from collections import Counter

from django.utils import timezone

from apps.authentication.models import User
from .models import Request
from .notifications import create_notif_if_new, format_overdue_duration

# Statuses where the item is still physically out with the borrower — used for
# overdue detection and flagging. RETURN_PENDING is included because a return
# isn't real until staff confirm receipt (two-step handshake).
OUTSTANDING_STATUSES = ['APPROVED', 'RETURN_PENDING']

# How many overdue items to enumerate in the staff digest before truncating.
STAFF_DIGEST_PREVIEW_LIMIT = 5


def _create_staff_digest(summaries):
    """One rolled-up notification to every staff/admin instead of N individual ones."""
    count = len(summaries)
    preview = ', '.join(summaries[:STAFF_DIGEST_PREVIEW_LIMIT])
    if count > STAFF_DIGEST_PREVIEW_LIMIT:
        preview += f' ... and {count - STAFF_DIGEST_PREVIEW_LIMIT} more'
    message = f'{count} overdue item{"s" if count != 1 else ""}: {preview}'
    for staff in User.objects.filter(role__in=['STAFF', 'ADMIN'], is_active=True):
        create_notif_if_new(recipient=staff, request_obj=None, notif_type='OVERDUE', message=message)


def run_overdue_scan():
    """Scan outstanding-but-overdue borrows: notify each borrower (deduped, so a
    re-scan won't spam an unread/recent alert), send a staff digest, and flag
    users. Returns a summary dict. Safe to call repeatedly (idempotent)."""
    now = timezone.now()
    overdue = list(
        Request.objects
        .filter(status__in=OUTSTANDING_STATUSES, expected_return__lt=now)
        .select_related('requested_by')
    )

    summaries = []
    flagged_user_ids = set()
    new_incident_per_user = Counter()
    # Penalty ledger is a persistent Request field, NOT notification existence —
    # notifications are deletable, which would let the same incident be charged
    # again. Each request's overdue incident is penalized at most once, ever.
    newly_penalized_req_ids = []

    for req in overdue:
        borrower = req.requested_by
        flagged_user_ids.add(borrower.pk)
        overdue_text = format_overdue_duration(now - req.expected_return)
        created = create_notif_if_new(
            recipient=borrower, request_obj=req, notif_type='OVERDUE',
            message=f'Your request for "{req.item_name}" is {overdue_text} overdue. Please return it.',
        )
        if created:
            name = borrower.get_full_name() or borrower.username
            id_tag = f' [{borrower.student_id}]' if borrower.student_id else ''
            summaries.append(f'"{req.item_name}" by {name}{id_tag} ({overdue_text})')
        if not req.overdue_penalty_applied:
            new_incident_per_user[borrower.pk] += 1
            newly_penalized_req_ids.append(req.id)

    if summaries:
        _create_staff_digest(summaries)

    # Persistently mark penalized requests so a re-scan never re-charges, even if
    # the borrower deletes their overdue notifications.
    if newly_penalized_req_ids:
        Request.objects.filter(id__in=newly_penalized_req_ids).update(overdue_penalty_applied=True)

    # Flag everyone with an outstanding overdue item; first-time incidents also
    # lower the credit score once so repeated scans do not keep charging points.
    for user_id in flagged_user_ids:
        new_count = new_incident_per_user.get(user_id, 0)
        if new_count > 0:
            user = User.objects.get(pk=user_id)
            user.apply_credit_change(-5 * new_count, late_incidents=new_count)
        else:
            User.objects.filter(pk=user_id).update(is_flagged=True)

    return {'overdue_total': len(overdue), 'notified': len(summaries)}
