"""Notification creation helpers shared by the request views and the overdue
scan. All creation goes through here so dedup + the live WS push stay
consistent (and the push is deferred to commit, see messaging.services)."""

from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.messaging.services import notify_user
from .models import Notification

# A read notification of the same (recipient, type, request) within this window
# suppresses a repeat — one reminder per day after the user has seen the last one.
DEDUP_COOLDOWN = timedelta(days=1)
DEDUPED_TYPES = {Notification.Type.OVERDUE}


def format_overdue_duration(overdue_delta):
    """Convert a timedelta into a human-readable overdue string."""
    total_minutes = int(overdue_delta.total_seconds() / 60)
    if total_minutes < 60:
        return f'{total_minutes} minute(s)'
    if total_minutes < 1440:
        return f'{total_minutes // 60} hour(s)'
    return f'{overdue_delta.days} day(s)'


def _dedup_filter(qs, request_obj):
    """Mirror the matching used everywhere: scope by request when given,
    otherwise match any notification of that type (e.g. the staff digest)."""
    return qs.filter(request=request_obj) if request_obj is not None else qs


def _push_notification(notif):
    # Lazy import keeps RequestSerializer free to import OUTSTANDING_STATUSES
    # without cycling through notifications -> serializers during startup.
    from .serializers import NotificationSerializer

    notify_user(notif.recipient_id, NotificationSerializer(notif).data)


def create_notif_if_new(recipient, request_obj, notif_type, message, sender=None):
    """Create a notification, applying reminder dedup only to DEDUPED_TYPES:
    1. If an UNREAD notification of the same type+request exists → skip
       (the user hasn't seen the first one yet, don't pile on).
    2. If the last READ notification was within the cooldown → skip.
    3. Otherwise create it and push it live (post-commit).
    Returns the created Notification, or None if skipped.
    """
    if notif_type not in DEDUPED_TYPES:
        notif = Notification.objects.create(
            recipient=recipient, sender=sender, request=request_obj,
            type=notif_type, message=message,
        )
        _push_notification(notif)
        return notif

    base = _dedup_filter(
        Notification.objects.filter(recipient=recipient, type=notif_type),
        request_obj,
    )
    if base.filter(is_read=False).exists():
        return None
    if base.filter(is_read=True, created_at__gte=timezone.now() - DEDUP_COOLDOWN).exists():
        return None

    try:
        with transaction.atomic():
            notif = Notification.objects.create(
                recipient=recipient, sender=sender, request=request_obj,
                type=notif_type, message=message,
            )
    except IntegrityError:
        # Concurrent overdue scans can both pass the existence check. The partial
        # unique constraint lets one insert win; the loser quietly skips.
        return None

    _push_notification(notif)
    return notif


def notify_many(recipients, request_obj, notif_type, message, sender=None):
    """Same dedup as create_notif_if_new but for a batch of recipients (e.g. all
    staff/admin). Does the dedup in ONE query, bulk-creates the survivors, and
    pushes each live — instead of 2-3 queries per recipient in a loop.
    Returns the list of created Notifications."""
    recipients = list(recipients)
    if not recipients:
        return []

    if notif_type in DEDUPED_TYPES:
        created = []
        for recipient in recipients:
            notif = create_notif_if_new(
                recipient=recipient,
                request_obj=request_obj,
                notif_type=notif_type,
                message=message,
                sender=sender,
            )
            if notif:
                created.append(notif)
        return created

    to_create = [
        Notification(recipient=u, sender=sender, request=request_obj, type=notif_type, message=message)
        for u in recipients
    ]

    created = Notification.objects.bulk_create(to_create)
    for notif in created:
        # request/sender/recipient are the in-memory objects we built with, so
        # serializing here does not trigger extra queries.
        _push_notification(notif)
    return created
