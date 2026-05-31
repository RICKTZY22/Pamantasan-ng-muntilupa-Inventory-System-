from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import Q, F, Count
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Request, Notification
from .serializers import (
    RequestSerializer,
    RequestCreateSerializer,
    RequestActionSerializer,
    NotificationSerializer,
)
from .notifications import create_notif_if_new, notify_many
from .overdue import OUTSTANDING_STATUSES, run_overdue_scan
from apps.authentication.models import User, AuditLog, log_action
from apps.permissions import IsStaffOrAbove, IsAdmin


# TODO(erick): the approve/reject actions share similar validation logic
# pwede siguro gawing mixin para mas malinis
class RequestViewSet(viewsets.ModelViewSet):
    # Generic PUT/PATCH/DELETE are disabled — every state change goes through an
    # explicit action (approve/reject/complete/cancel/return handshake). This blocks
    # a user from PATCHing their own request (e.g. {"status":"APPROVED"}) to self-
    # approve, or DELETE-ing it to hard-delete past the is_cleared soft-delete.
    http_method_names = ['get', 'post', 'head', 'options']

    queryset = Request.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return RequestCreateSerializer
        return RequestSerializer

    def get_permissions(self):
        if self.action in ['approve', 'reject', 'check_overdue']:
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
        req = serializer.save(
            requested_by=request.user,
            item_name=item.name,
            priority=item.priority,
        )

        # Audit log
        log_action(AuditLog.REQUEST_CREATED, user=request.user,
                   details=f'Created request for "{req.item_name}" (qty: {req.quantity})',
                   request=request)

        # Notify all staff/admin about the new request (batched dedup + push).
        author_name = request.user.get_full_name() or request.user.username
        staff_users = User.objects.filter(
            role__in=['STAFF', 'ADMIN'], is_active=True,
        ).exclude(id=request.user.id)
        notify_many(
            staff_users,
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

    def _get_locked_request(self, request, pk):
        """Fetch a request with a row lock for state-changing transitions.
        Prevents double-clicks or parallel staff actions from approving/rejecting
        the same pending request at the same time.
        """
        queryset = Request.objects.select_for_update().filter(is_cleared=False)
        if not request.user.has_min_role('STAFF'):
            queryset = queryset.filter(requested_by=request.user)
        req = get_object_or_404(queryset, pk=pk)
        self.check_object_permissions(request, req)
        return req

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """I-approve yung pending request, bawasan stock, at i-notify yung nag-request."""
        with transaction.atomic():
            req = self._get_locked_request(request, pk)

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
        create_notif_if_new(
            recipient=req.requested_by,
            request_obj=req,
            notif_type='STATUS_CHANGE',
            message=f'{approver_name} approved your request for "{req.item_name}"',
            sender=request.user,
        )

        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        serializer = RequestActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            req = self._get_locked_request(request, pk)

            guard = self._ensure_pending(req, 'rejected')
            if guard:
                return guard

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
        create_notif_if_new(
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

        # Returnable items must go through the return handshake (request_return →
        # confirm_return) so stock is restored — not silently force-completed.
        if req.item.is_returnable:
            return Response(
                {'error': 'Returnable items must be returned (use the return flow), not completed.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req.status = 'COMPLETED'
        req.save()

        # Let the requester know (deduped)
        completer = request.user.get_full_name() or request.user.username
        create_notif_if_new(
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
    def request_return(self, request, pk=None):
        """Step 1 of the return handshake: the borrower (or staff) signals that
        the item is being returned. It moves to RETURN_PENDING and waits for a
        staff member to confirm physical receipt. Stock is NOT restored yet, so
        an accidental press here closes nothing."""
        req = self.get_object()

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
        if not req.item.is_returnable:
            return Response(
                {'error': 'This item is not returnable'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req.status = 'RETURN_PENDING'
        req.return_requested_at = timezone.now()
        req.return_requested_by = request.user
        req.save(update_fields=['status', 'return_requested_at', 'return_requested_by', 'updated_at'])

        log_action(AuditLog.REQUEST_RETURNED, user=request.user,
                   details=f'Return requested for request #{req.id} "{req.item_name}" — awaiting staff confirmation',
                   request=request)

        # Tell staff/admin a return is waiting for confirmation (batched).
        requester_name = request.user.get_full_name() or request.user.username
        notify_many(
            User.objects.filter(role__in=['STAFF', 'ADMIN'], is_active=True),
            request_obj=req, notif_type='STATUS_CHANGE',
            message=f'{requester_name} is returning "{req.item_name}". Please confirm receipt.',
            sender=request.user,
        )
        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def confirm_return(self, request, pk=None):
        """Step 2 of the return handshake: a staff/admin confirms the item was
        physically received. Only now is stock restored and the request closed.
        Requires RETURN_PENDING, so it can't fire without a borrower's request."""
        if not request.user.has_min_role('STAFF'):
            return Response(
                {'error': 'Staff access required to confirm a return'},
                status=status.HTTP_403_FORBIDDEN,
            )
        from apps.inventory.models import Item
        with transaction.atomic():
            req = self._get_locked_request(request, pk)
            if req.status != 'RETURN_PENDING':
                return Response(
                    {'error': 'Only a pending return can be confirmed. Ask the borrower to start the return first.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Restore stock atomically now that receipt is confirmed.
            item = req.item
            Item.objects.filter(pk=item.pk).update(quantity=F('quantity') + req.quantity)
            item.refresh_from_db()
            if item.status == 'IN_USE':
                item.status = 'AVAILABLE'
                item.save(update_fields=['status'])

            req.status = 'RETURNED'
            req.returned_at = timezone.now()
            req.return_confirmed_by = request.user
            req.save(update_fields=['status', 'returned_at', 'return_confirmed_by', 'updated_at'])

            # The item is back — clear any lingering OVERDUE alerts for it so a
            # returned item never keeps showing as overdue in the bell.
            Notification.objects.filter(request=req, type='OVERDUE').delete()

            # Auto-unflag the borrower if they have no remaining outstanding overdue items.
            borrower = req.requested_by
            remaining_overdue = Request.objects.filter(
                requested_by=borrower,
                status__in=OUTSTANDING_STATUSES,
                expected_return__lt=timezone.now(),
            ).exclude(pk=req.pk).count()
            if remaining_overdue == 0 and borrower.is_flagged:
                borrower.is_flagged = False
                borrower.save(update_fields=['is_flagged'])

        log_action(AuditLog.REQUEST_RETURNED, user=request.user,
                   details=f'Confirmed return of request #{req.id} "{req.item_name}" (qty: {req.quantity})',
                   request=request)

        confirmer_name = request.user.get_full_name() or request.user.username
        if req.requested_by != request.user:
            create_notif_if_new(
                recipient=req.requested_by, request_obj=req, notif_type='STATUS_CHANGE',
                message=f'{confirmer_name} confirmed the return of your borrowed item "{req.item_name}".',
                sender=request.user,
            )
        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def cancel_return(self, request, pk=None):
        """Undo a pending return (e.g. requested by mistake, or the item wasn't
        actually handed over). Reverts RETURN_PENDING back to APPROVED."""
        with transaction.atomic():
            req = self._get_locked_request(request, pk)
            if req.requested_by != request.user and not request.user.has_min_role('STAFF'):
                return Response(
                    {'error': 'You can only cancel a return on your own request'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if req.status != 'RETURN_PENDING':
                return Response(
                    {'error': 'Only a pending return can be cancelled'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            req.status = 'APPROVED'
            req.return_requested_at = None
            req.return_requested_by = None
            req.save(update_fields=['status', 'return_requested_at', 'return_requested_by', 'updated_at'])

        log_action(AuditLog.OTHER, user=request.user,
                   details=f'Cancelled pending return for request #{req.id} "{req.item_name}"',
                   request=request)
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

    @action(detail=False, methods=['get'])
    def stats(self, request):
        # One aggregate query with conditional counts instead of 7 round-trips.
        overdue_q = Q(status__in=OUTSTANDING_STATUSES, expected_return__lt=timezone.now())
        stats = self.get_queryset().aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='PENDING')),
            approved=Count('id', filter=Q(status='APPROVED')),
            completed=Count('id', filter=Q(status='COMPLETED')),
            rejected=Count('id', filter=Q(status='REJECTED')),
            returned=Count('id', filter=Q(status='RETURNED')),
            overdue=Count('id', filter=overdue_q),
        )
        return Response(stats)

    @action(detail=False, methods=['post'], permission_classes=[IsAdmin])
    def clear_history(self, request):
        """Permanently delete completed/returned/rejected/cancelled requests.
        Admin-only, and requires the configured clear code (no hardcoded fallback).
        """
        admin_code = request.data.get('code', '')
        from django.conf import settings as django_settings
        from django.core.cache import cache
        # No source-embedded fallback: the code must be set via set_clear_code
        # (cache) or the HISTORY_CLEAR_CODE env var. If neither is set, refuse.
        expected_code = cache.get('history_clear_code') or getattr(django_settings, 'HISTORY_CLEAR_CODE', '')

        if not expected_code:
            return Response(
                {'error': 'Clear code is not configured. An admin must set it first.'},
                status=status.HTTP_403_FORBIDDEN,
            )
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
            status__in=OUTSTANDING_STATUSES,
            expected_return__lt=timezone.now(),
        )
        serializer = RequestSerializer(overdue, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def check_overdue(self, request):
        """Run the overdue scan (notify borrowers + staff digest + flag users).
        Idempotent — a re-scan won't re-spam an unread/recent alert. The real
        logic lives in apps.requests.overdue so the management command can reuse
        it for scheduled runs."""
        result = run_overdue_scan()
        return Response({'status': f"{result['notified']} overdue notifications created"})


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

    def create(self, request, *args, **kwargs):
        """Notifications are system-generated only.
        Keep POST enabled for collection actions like read_all, but reject
        direct notification creation so clients cannot forge alerts.
        """
        return Response(
            {'detail': 'Direct notification creation is not allowed.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

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

