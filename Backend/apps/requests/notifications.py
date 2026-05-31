"""Notification creation helpers shared by the request views and the overdue
scan. All creation goes through here so dedup + the live WS push stay
consistent (and the push is deferred to commit, see messaging.services)."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.messaging.services import notify_user
from .models import Notification
from .serializers import NotificationSerializer

# A read notification of the same (recipient, type, request) within this window
# suppresses a repeat — one reminder per day after the user has seen the last one.
DEDUP_COOLDOWN = timedelta(days=1)


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


def create_notif_if_new(recipient, request_obj, notif_type, message, sender=None):
    """Smart notification dedup:
    1. If an UNREAD notification of the same type+request exists → skip
       (the user hasn't seen the first one yet, don't pile on).
    2. If the last READ notification was within the cooldown → skip.
    3. Otherwise create it and push it live (post-commit).
    Returns the created Notification, or None if skipped.
    """
    base = _dedup_filter(
        Notification.objects.filter(recipient=recipient, type=notif_type),
        request_obj,
    )
    if base.filter(is_read=False).exists():
        return None
    if base.filter(is_read=True, created_at__gte=timezone.now() - DEDUP_COOLDOWN).exists():
        return None

    notif = Notification.objects.create(
        recipient=recipient, sender=sender, request=request_obj,
        type=notif_type, message=message,
    )
    notify_user(recipient.id, NotificationSerializer(notif).data)
    return notif


def notify_many(recipients, request_obj, notif_type, message, sender=None):
    """Same dedup as create_notif_if_new but for a batch of recipients (e.g. all
    staff/admin). Does the dedup in ONE query, bulk-creates the survivors, and
    pushes each live — instead of 2-3 queries per recipient in a loop.
    Returns the list of created Notifications."""
    recipients = list(recipients)
    if not recipients:
        return []

    recipient_ids = [u.id for u in recipients]
    base = _dedup_filter(
        Notification.objects.filter(type=notif_type, recipient_id__in=recipient_ids),
        request_obj,
    )
    cooldown_start = timezone.now() - DEDUP_COOLDOWN
    skip_ids = set(
        base.filter(Q(is_read=False) | Q(is_read=True, created_at__gte=cooldown_start))
            .values_list('recipient_id', flat=True)
    )

    to_create = [
        Notification(recipient=u, sender=sender, request=request_obj, type=notif_type, message=message)
        for u in recipients if u.id not in skip_ids
    ]
    if not to_create:
        return []

    created = Notification.objects.bulk_create(to_create)
    for notif in created:
        # request/sender/recipient are the in-memory objects we built with, so
        # serializing here does not trigger extra queries.
        notify_user(notif.recipient_id, NotificationSerializer(notif).data)
    return created
