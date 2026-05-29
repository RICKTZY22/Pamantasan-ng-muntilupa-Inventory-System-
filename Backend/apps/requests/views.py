from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, F
from django.utils import timezone

from .models import Request, Comment, Notification
from .serializers import (
    RequestSerializer,
    RequestCreateSerializer,
    RequestActionSerializer,
    CommentSerializer,
    CommentCreateSerializer,
    NotificationSerializer,
)
from apps.authentication.models import User, AuditLog, log_action
from apps.permissions import IsStaffOrAbove


# How many overdue items to enumerate in the staff digest before truncating
# with "...and N more". Keeps push notifications readable.
STAFF_DIGEST_PREVIEW_LIMIT = 5


# helper para di mag-spam ng duplicate notifications
# pag nag-double click or may network retry, iche-check muna kung meron na
from collections import Counter
from datetime import timedelta

def _format_overdue_duration(overdue_delta):
    """Convert a timedelta into a human-readable overdue string."""
    total_minutes = int(overdue_delta.total_seconds() / 60)
    if total_minutes < 60:
        return f'{total_minutes} minute(s)'
    if total_minutes < 1440:
        return f'{total_minutes // 60} hour(s)'
    return f'{overdue_delta.days} day(s)'

def _create_notif_if_new(recipient, request_obj, notif_type, message, sender=None):
    """Smart notification dedup:
    1. If there's an UNREAD notification of the same type+request → skip entirely
       (user hasn't seen the first one yet, don't pile on)
    2. If the last READ notification was within 1 day → skip
       (only remind once per day after they've read the previous one)
    3. Otherwise → create the notification
    """
    base_filter = {
        'recipient': recipient,
        'type': notif_type,
    }
    if request_obj is not None:
        base_filter['request'] = request_obj

    # Rule 1: unread notification of same type+request exists → skip
    has_unread = Notification.objects.filter(**base_filter, is_read=False).exists()
    if has_unread:
        return

    # Rule 2: read notification within last 24 hours → skip (1-day cooldown)
    one_day_ago = timezone.now() - timedelta(days=1)
    recent_read = Notification.objects.filter(
        **base_filter,
        is_read=True,
        created_at__gte=one_day_ago,
    ).exists()
    if recent_read:
        return

    Notification.objects.create(
        recipient=recipient,
        sender=sender,
        request=request_obj,
        type=notif_type,
        message=message,
    )


# TODO(erick): the approve/reject actions share similar validation logic
# pwede siguro gawing mixin para mas malinis
class RequestViewSet(viewsets.ModelViewSet):

    queryset = Request.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return RequestCreateSerializer
        return RequestSerializer

    def get_permissions(self):
        if self.action in ['approve', 'reject']:
            return [IsStaffOrAbove()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        # Reports/charts pass ?include_cleared=true to get ALL historical data.
        # The active request list (Requests page) excludes cleared records.
        include_cleared = self.request.query_params.get('include_cleared', '').lower() == 'true'
        if include_cleared:
            queryset = Request.objects.all()
        else:
            queryset = Request.objects.filter(is_cleared=False)
        user = self.request.user

        if not user.has_min_role('STAFF'):
            queryset = queryset.filter(requested_by=user)

        # Filters
        status_filter = self.request.query_params.get('status', '')
        search = self.request.query_params.get('search', '')

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if search:
            queryset = queryset.filter(
                Q(item_name__icontains=search) |
                Q(purpose__icontains=search)
            )

        return queryset.select_related('requested_by', 'approved_by', 'item')

    def create(self, request, *args, **kwargs):
        # Flagged users have unreturned overdue items. Block new requests until
        # they clear their backlog — an admin can unflag them via the admin
        # panel if there's a legitimate need to bypass.
        if request.user.is_flagged:
            return Response(
                {
                    'error': 'Your account is flagged for overdue items. '
                             'Please return your overdue items before submitting new requests.',
                    'code': 'ACCOUNT_FLAGGED',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Auto-inherit priority from the item (set by staff/admin in inventory)
        item = serializer.validated_data['item']
        req = serializer.save(requested_by=request.user, priority=item.priority)

        # Audit log
        log_action(AuditLog.REQUEST_CREATED, user=request.user,
                   details=f'Created request for "{req.item_name}" (qty: {req.quantity})',
                   request=request)

        # Notify all staff/admin about the new request
        # uses dedup helper so re-submitting the same request doesn't spam
        author_name = request.user.get_full_name() or request.user.username
        staff_users = User.objects.filter(
            role__in=['STAFF', 'ADMIN']
        ).exclude(id=request.user.id)
        for staff in staff_users:
            _create_notif_if_new(
                recipient=staff,
                request_obj=req,
                notif_type='STATUS_CHANGE',
                message=f'{author_name} submitted a new request for "{req.item_name}"',
                sender=request.user,
            )

        return Response(
            RequestSerializer(req).data,
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _ensure_pending(req, action_verb):
        """Reject transitions on requests that aren't still PENDING.
        Returns a Response to early-exit from the calling action, or None when OK."""
        if req.status != 'PENDING':
            return Response(
                {'error': f'Only pending requests can be {action_verb}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """I-approve yung pending request, bawasan stock, at i-notify yung nag-request."""
        req = self.get_object()

        guard = self._ensure_pending(req, 'approved')
        if guard:
            return guard

        # Prevent self-approval (requester cannot approve their own request)
        if req.requested_by == request.user:
            return Response(
                {'error': 'You cannot approve your own request'},
                status=status.HTTP_403_FORBIDDEN,
            )

        # atomically check at bawasan yung stock para walang race condition
        item = req.item
        from apps.inventory.models import Item
        updated = Item.objects.filter(
            pk=item.pk,
            quantity__gte=req.quantity,
        ).update(quantity=F('quantity') - req.quantity)

        if not updated:
            # Re-read to give an accurate error message
            item.refresh_from_db()
            return Response(
                {'error': f'Insufficient stock. Only {item.quantity} available, but {req.quantity} requested.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If quantity hit zero, mark item as IN_USE
        item.refresh_from_db()
        if item.quantity == 0:
            item.status = 'IN_USE'
            item.save(update_fields=['status'])

        req.approved_by = request.user
        req.approved_at = timezone.now()

        # pag consumable (di returnable), auto-complete na agad
        # kasi wala namang ibabalik eh
        if not item.is_returnable:
            req.status = 'COMPLETED'
        else:
            req.status = 'APPROVED'
            # Auto-calculate expected return from item's borrow duration
            if item.borrow_duration:
                delta = item.get_return_timedelta()
                if delta:
                    req.expected_return = timezone.now() + delta

        req.save()

        # Audit log
        log_action(AuditLog.REQUEST_APPROVED, user=request.user,
                   details=f'Approved request #{req.id} for "{req.item_name}" (qty: {req.quantity})',
                   request=request)

        # Notify the requester about approval (deduped)
        approver_name = request.user.get_full_name() or request.user.username
        _create_notif_if_new(
            recipient=req.requested_by,
            request_obj=req,
            notif_type='STATUS_CHANGE',
            message=f'{approver_name} approved your request for "{req.item_name}"',
            sender=request.user,
        )

        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        req = self.get_object()

        guard = self._ensure_pending(req, 'rejected')
        if guard:
            return guard

        serializer = RequestActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        req.status = 'REJECTED'
        req.approved_by = request.user
        req.approved_at = timezone.now()
        req.rejection_reason = serializer.validated_data.get('reason', '')
        req.save()

        # Audit log
        log_action(AuditLog.REQUEST_REJECTED, user=request.user,
                   details=f'Rejected request #{req.id} for "{req.item_name}". Reason: {req.rejection_reason or "(none)"}',
                   request=request)

        # Notify the requester about rejection (deduped)
        rejector_name = request.user.get_full_name() or request.user.username
        reason_text = f' Reason: "{req.rejection_reason}"' if req.rejection_reason else ''
        _create_notif_if_new(
            recipient=req.requested_by,
            request_obj=req,
            notif_type='STATUS_CHANGE',
            message=f'{rejector_name} rejected your request for "{req.item_name}".{reason_text}',
            sender=request.user,
        )

        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        req = self.get_object()

        # yung nag-request lang or staff/admin pwede mag-complete
        if req.requested_by != request.user and not request.user.has_min_role('STAFF'):
            return Response(
                {'error': 'You can only complete your own requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if req.status != 'APPROVED':
            return Response(
                {'error': 'Only approved requests can be completed'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req.status = 'COMPLETED'
        req.save()

        # Let the requester know (deduped)
        completer = request.user.get_full_name() or request.user.username
        _create_notif_if_new(
            recipient=req.requested_by,
            request_obj=req,
            notif_type='STATUS_CHANGE',
            message=f'{completer} marked your request for "{req.item_name}" as completed.',
            sender=request.user,
        )

        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        req = self.get_object()

        if req.requested_by != request.user and not request.user.has_min_role('STAFF'):
            return Response(
                {'error': 'You can only cancel your own requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if req.status != 'PENDING':
            return Response(
                {'error': 'Only pending requests can be cancelled'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req.status = 'CANCELLED'
        req.save()

        # Audit log
        log_action(AuditLog.OTHER, user=request.user,
                   details=f'Cancelled request #{req.id} for "{req.item_name}"',
                   request=request)

        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def return_item(self, request, pk=None):
        """I-handle yung pag-return ng borrowed item at ibalik yung stock."""
        req = self.get_object()

        # Only the requester or staff/admin can return an item
        if req.requested_by != request.user and not request.user.has_min_role('STAFF'):
            return Response(
                {'error': 'You can only return your own borrowed items'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if req.status not in ('APPROVED', 'COMPLETED'):
            return Response(
                {'error': 'Only approved or completed requests can be returned'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Check if item is returnable
        item = req.item
        if not item.is_returnable:
            return Response(
                {'error': 'This item is not returnable'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # i-restore yung stock, atomic para safe
        from apps.inventory.models import Item
        Item.objects.filter(pk=item.pk).update(quantity=F('quantity') + req.quantity)
        item.refresh_from_db()
        if item.status == 'IN_USE':
            item.status = 'AVAILABLE'
            item.save(update_fields=['status'])

        req.status = 'RETURNED'
        req.returned_at = timezone.now()
        req.save()

        # Auto-unflag user if they have no remaining overdue items
        borrower = req.requested_by
        remaining_overdue = Request.objects.filter(
            requested_by=borrower,
            status__in=['APPROVED', 'COMPLETED'],
            expected_return__lt=timezone.now(),
        ).exclude(pk=req.pk).count()

        if remaining_overdue == 0 and borrower.is_flagged:
            borrower.is_flagged = False
            borrower.save(update_fields=['is_flagged'])

        # Audit log
        log_action(AuditLog.REQUEST_RETURNED, user=request.user,
                   details=f'Returned item for request #{req.id} "{req.item_name}" (qty: {req.quantity})',
                   request=request)

        # Notify the requester about the return (deduped, only if someone else returned it)
        returner_name = request.user.get_full_name() or request.user.username
        if req.requested_by != request.user:
            _create_notif_if_new(
                recipient=req.requested_by,
                request_obj=req,
                notif_type='STATUS_CHANGE',
                message=f'{returner_name} returned your borrowed item "{req.item_name}".',
                sender=request.user,
            )

        return Response(RequestSerializer(req).data)

    @action(detail=False, methods=['delete'])
    def clear_completed(self, request):
        # staff/admin lang pwede mag-bulk clear
        if not request.user.has_min_role('STAFF'):
            return Response(
                {'error': 'Staff access required to clear requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        clearable_statuses = ['COMPLETED', 'RETURNED', 'REJECTED', 'CANCELLED']
        qs = self.get_queryset().filter(status__in=clearable_statuses)
        count = qs.update(is_cleared=True)  # soft-delete: keep for reports/charts

        # Audit log
        log_action(AuditLog.OTHER, user=request.user,
                   details=f'Cleared {count} completed/returned/rejected/cancelled requests',
                   request=request)

        return Response({'status': f'{count} requests cleared'})

    @action(detail=True, methods=['get', 'post'])
    def comments(self, request, pk=None):
        req = self.get_object()

        if request.method == 'GET':
            comments = req.comments.all()
            serializer = CommentSerializer(comments, many=True)
            return Response(serializer.data)

        elif request.method == 'POST':
            serializer = CommentCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)

            comment = Comment.objects.create(
                request=req,
                author=request.user,
                text=serializer.validated_data['text'],
            )

            # Auto-create notifications for request owner + all previous commenters + staff/admin
            recipients = set()
            # Always notify the request owner (unless they are the commenter)
            if req.requested_by_id != request.user.id:
                recipients.add(req.requested_by_id)
            # Notify all previous commenters (except the current commenter)
            for c in req.comments.exclude(author=request.user).values_list('author_id', flat=True).distinct():
                recipients.add(c)
            # Notify all staff/admin users who aren't already in recipients
            staff_ids = User.objects.filter(
                role__in=['STAFF', 'ADMIN']
            ).exclude(id=request.user.id).values_list('id', flat=True)
            for sid in staff_ids:
                recipients.add(sid)

            author_name = request.user.get_full_name() or request.user.username
            message = f'{author_name} commented on "{req.item_name}": "{comment.text[:80]}"'
            # dedup comments too — rapid double-post shouldn't spam everyone
            # Bulk-fetch all recipients in a single query (fixes N+1)
            recipient_users = User.objects.in_bulk(list(recipients))
            for recipient_id, recipient in recipient_users.items():
                _create_notif_if_new(
                    recipient=recipient,
                    request_obj=req,
                    notif_type='COMMENT',
                    message=message,
                    sender=request.user,
                )

            return Response(
                CommentSerializer(comment).data,
                status=status.HTTP_201_CREATED,
            )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        queryset = self.get_queryset()
        overdue_qs = queryset.filter(
            status__in=['APPROVED', 'COMPLETED'],
            expected_return__lt=timezone.now(),
        )

        stats = {
            'total': queryset.count(),
            'pending': queryset.filter(status='PENDING').count(),
            'approved': queryset.filter(status='APPROVED').count(),
            'completed': queryset.filter(status='COMPLETED').count(),
            'rejected': queryset.filter(status='REJECTED').count(),
            'returned': queryset.filter(status='RETURNED').count(),
            'overdue': overdue_qs.count(),
        }

        return Response(stats)

    @action(detail=False, methods=['post'], permission_classes=[IsStaffOrAbove])
    def clear_history(self, request):
        """Clear all completed/returned/rejected/cancelled requests.
        Requires the admin-set clear code for safety.
        """
        admin_code = request.data.get('code', '')
        from django.conf import settings as django_settings
        from django.core.cache import cache
        expected_code = cache.get('history_clear_code') or getattr(django_settings, 'HISTORY_CLEAR_CODE', 'PLMun2025')

        if admin_code != expected_code:
            return Response(
                {'error': 'Invalid clear code. Contact your administrator.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        clearable = Request.objects.filter(
            status__in=['COMPLETED', 'RETURNED', 'REJECTED', 'CANCELLED'],
        )
        count, _ = clearable.delete()

        log_action(
            AuditLog.OTHER,
            user=request.user,
            details=f'Cleared {count} request history records',
            request=request,
        )

        return Response({'status': f'{count} history records cleared'})

    @action(detail=False, methods=['post'], permission_classes=[IsStaffOrAbove])
    def set_clear_code(self, request):
        """Admin sets or updates the clear code.
        Stored in a simple system preferences key in localStorage on frontend,
        but validated here against the Django settings.
        """
        if not request.user.has_min_role('ADMIN'):
            return Response(
                {'error': 'Only admins can set the clear code.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_code = request.data.get('code', '').strip()
        if len(new_code) < 4:
            return Response(
                {'error': 'Code must be at least 4 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Store in Django settings file is not practical at runtime,
        # so we store it in a lightweight cache/DB approach using a simple model
        # For now, use a simple key-value in the system — stored via environment or cache
        from django.core.cache import cache
        cache.set('history_clear_code', new_code, timeout=None)

        log_action(
            AuditLog.OTHER,
            user=request.user,
            details='Updated history clear code',
            request=request,
        )

        return Response({'status': 'Clear code updated successfully'})

    @action(detail=False, methods=['get'])
    def overdue_requests(self, request):
        overdue = self.get_queryset().filter(
            status__in=['APPROVED', 'COMPLETED'],
            expected_return__lt=timezone.now(),
        )
        serializer = RequestSerializer(overdue, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def check_overdue(self, request):
        """Scan overdue borrows, notify borrowers, send a staff digest, and flag users.
        Idempotent: requests already notified today are skipped so a re-scan doesn't
        spam users. Pre-fetches with select_related to avoid N+1 queries."""
        now = timezone.now()
        overdue = (
            Request.objects.filter(status__in=['APPROVED', 'COMPLETED'], expected_return__lt=now)
            .select_related('requested_by')
        )
        already_notified_today_ids = self._overdue_already_notified_today(overdue, now)
        # Snapshot which overdue requests had EVER been notified BEFORE this scan.
        # Captured pre-bulk_create so the new notifications we're about to issue
        # don't accidentally count themselves as "already seen" (which would
        # suppress the lifetime overdue_count increment).
        ever_notified_ids = set(
            Notification.objects.filter(
                type='OVERDUE',
                request__in=overdue,
            ).values_list('request_id', flat=True)
        )

        borrower_notifications, flagged_user_ids, overdue_summaries = (
            self._build_overdue_notifications(overdue, already_notified_today_ids, now)
        )
        Notification.objects.bulk_create(borrower_notifications)

        if overdue_summaries:
            self._create_staff_digest(overdue_summaries)

        if flagged_user_ids:
            self._flag_overdue_users(overdue, flagged_user_ids, ever_notified_ids)

        return Response({'status': f'{len(borrower_notifications)} overdue notifications created'})

    # ── check_overdue helpers ────────────────────────────────────────────
    # Each phase of the scan is broken out so the orchestrator above reads
    # top-to-bottom and each helper is independently testable.

    @staticmethod
    def _overdue_already_notified_today(overdue_qs, now):
        """Request IDs that already received an OVERDUE notification today.
        Used to skip them this run so borrowers don't get the same alert twice."""
        return set(
            Notification.objects.filter(
                type='OVERDUE',
                created_at__date=now.date(),
                request__in=overdue_qs,
            ).values_list('request_id', flat=True)
        )

    @staticmethod
    def _build_overdue_notifications(overdue_qs, already_notified_today_ids, now):
        """Build (but don't yet save) per-borrower OVERDUE notifications.
        Returns (notifications, flagged_user_ids, summaries_for_staff_digest)."""
        notifications = []
        flagged_user_ids = set()
        summaries = []

        for req in overdue_qs:
            if req.id in already_notified_today_ids:
                continue

            overdue_text = _format_overdue_duration(now - req.expected_return)
            borrower = req.requested_by
            flagged_user_ids.add(borrower.pk)

            notifications.append(Notification(
                recipient=borrower,
                request=req,
                type='OVERDUE',
                message=f'Your request for "{req.item_name}" is {overdue_text} overdue. Please return it.',
            ))

            borrower_name = borrower.get_full_name() or borrower.username
            id_tag = f' [{borrower.student_id}]' if borrower.student_id else ''
            summaries.append(f'"{req.item_name}" by {borrower_name}{id_tag} ({overdue_text})')

        return notifications, flagged_user_ids, summaries

    @staticmethod
    def _create_staff_digest(overdue_summaries):
        """Send all staff/admins a single rolled-up notification instead of N individual ones.
        Example message: '3 overdue items: "Laptop" by John (2 days), "Projector" by Jane (1 hour)'."""
        count = len(overdue_summaries)
        preview = ', '.join(overdue_summaries[:STAFF_DIGEST_PREVIEW_LIMIT])
        if count > STAFF_DIGEST_PREVIEW_LIMIT:
            preview += f' ... and {count - STAFF_DIGEST_PREVIEW_LIMIT} more'
        summary_msg = f'{count} overdue item{"s" if count != 1 else ""}: {preview}'

        for staff in User.objects.filter(role__in=['STAFF', 'ADMIN']):
            _create_notif_if_new(
                recipient=staff,
                request_obj=None,  # digest isn't tied to a single request
                notif_type='OVERDUE',
                message=summary_msg,
            )

    @staticmethod
    def _flag_overdue_users(overdue_qs, flagged_user_ids, ever_notified_ids):
        """Set is_flagged and increment overdue_count for the affected users.
        Only counts requests that hadn't been overdue-notified before this scan
        so the lifetime counter doesn't inflate on repeated daily scans.
        `ever_notified_ids` must be captured BEFORE bulk_create — otherwise the
        notifications we just issued would suppress their own counter bump."""
        new_overdue_per_user = Counter(
            req.requested_by_id for req in overdue_qs if req.id not in ever_notified_ids
        )

        for user_id in flagged_user_ids:
            new_count = new_overdue_per_user.get(user_id, 0)
            update_fields = {'is_flagged': True}
            if new_count > 0:
                update_fields['overdue_count'] = F('overdue_count') + new_count
            User.objects.filter(pk=user_id).update(**update_fields)


class NotificationViewSet(viewsets.ModelViewSet):
    """Notifications ng user - scoped sa authenticated user lang."""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        # dati may [:100] slicing dito na sumisira sa clear_all at read_all
        # kasi hindi mo pwede i-filter or i-delete yung sliced queryset sa Django
        # pinagod ako ng bug na 'to nang ilang oras haha
        return (
            Notification.objects
            .filter(recipient=self.request.user)
            .select_related('sender', 'request')
            .order_by('-created_at')
        )

    def list(self, request, *args, **kwargs):
        # cap at 100 so we don't send thousands of old notifs
        qs = self.get_queryset()[:100]
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'])
    def read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=['post'])
    def read_all(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'status': f'{updated} marked as read'})

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})

    @action(detail=False, methods=['delete'])
    def clear_all(self, request):
        count, _ = self.get_queryset().delete()
        return Response({'status': f'{count} notifications cleared'})

