from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from datetime import timedelta

from django.db import transaction
from django.db.models import Q, F, Count, Case, When, IntegerField, Value, Sum, CharField
from django.db.models.functions import Concat
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


def get_range_start(range_key):
    """Local-time start datetime for a dashboard range key, or None for 'all'.
    Single source of truth for period boundaries (week starts Sunday)."""
    now_local = timezone.localtime()

    def _midnight(d):
        return d.replace(hour=0, minute=0, second=0, microsecond=0)

    if range_key == 'week':
        return _midnight(now_local - timedelta(days=(now_local.weekday() + 1) % 7))
    if range_key == 'month':
        return _midnight(now_local.replace(day=1))
    if range_key == 'quarter':
        q_month = ((now_local.month - 1) // 3) * 3 + 1
        return _midnight(now_local.replace(month=q_month, day=1))
    if range_key == 'year':
        return _midnight(now_local.replace(month=1, day=1))
    return None


# Terminal statuses eligible for clearing (soft-delete) / history purge.
CLEARABLE_STATUSES = ['COMPLETED', 'RETURNED', 'REJECTED', 'CANCELLED']


class RequestViewSet(viewsets.ModelViewSet):
    # State changes use explicit actions, not generic PATCH/DELETE.
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    queryset = Request.objects.all()

    def get_serializer_class(self):
        if self.action == 'create':
            return RequestCreateSerializer
        return RequestSerializer

    def get_permissions(self):
        if self.action in ['approve', 'reject', 'complete']:
            return [IsStaffOrAbove()]
        if self.action == 'auto_decision_config':
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        # Reports can include cleared history; active lists hide it.
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
        completed_filter = self.request.query_params.get('completed', '').lower() == 'true'
        search = self.request.query_params.get('search', '').strip()

        if completed_filter:
            queryset = queryset.filter(status__in=['COMPLETED', 'RETURNED'])
        elif status_filter:
            queryset = queryset.filter(status=status_filter)

        priority_filter = self.request.query_params.get('priority', '').strip()
        if priority_filter:
            queryset = queryset.filter(priority=priority_filter)

        if search:
            if user.has_min_role('STAFF'):
                queryset = queryset.annotate(
                    borrower_full_name=Concat(
                        'requested_by__first_name',
                        Value(' '),
                        'requested_by__last_name',
                        output_field=CharField(),
                    )
                ).filter(
                    Q(borrower_full_name__icontains=search) |
                    Q(requested_by__first_name__icontains=search) |
                    Q(requested_by__last_name__icontains=search) |
                    Q(requested_by__username__icontains=search) |
                    Q(requested_by__email__icontains=search) |
                    Q(requested_by__student_id__icontains=search)
                )
            else:
                queryset = queryset.filter(
                    Q(item_name__icontains=search) |
                    Q(purpose__icontains=search)
                )

        # Staff can switch between all requests and their own.
        if self.request.query_params.get('mine', '').lower() == 'true':
            queryset = queryset.filter(requested_by=user)

        # Overdue pseudo-status tab: still-out items past their due date.
        if self.request.query_params.get('overdue', '').lower() == 'true':
            queryset = queryset.filter(
                status__in=OUTSTANDING_STATUSES,
                expected_return__lt=timezone.now(),
            )

        # Stable order for paginated pages.
        queryset = queryset.annotate(
            _priority_order=Case(
                When(priority='HIGH', then=Value(3)),
                When(priority='MEDIUM', then=Value(2)),
                When(priority='LOW', then=Value(1)),
                default=Value(0),
                output_field=IntegerField(),
            )
        ).order_by('-_priority_order', '-created_at')

        return queryset.select_related('requested_by', 'approved_by', 'item')

    def _report_base_qs(self):
        """Role-scoped base queryset for the aggregation actions (stats /
        popular_items / overdue_grouped), WITHOUT the list-view query-param
        filters (status/search/overdue/mine) that get_queryset applies — so the
        overdue panel's ?search= isn't hijacked by the list's item/purpose search,
        and no inherited order_by leaks into GROUP BY."""
        include_cleared = self.request.query_params.get('include_cleared', '').lower() == 'true'
        qs = Request.objects.all() if include_cleared else Request.objects.filter(is_cleared=False)
        if not self.request.user.has_min_role('STAFF'):
            qs = qs.filter(requested_by=self.request.user)
        return qs

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

        if getattr(request.user, 'credit_score', 100) <= User.CREDIT_DISABLE_THRESHOLD:
            if request.user.is_active:
                request.user.is_active = False
                request.user.save(update_fields=['is_active'])
            return Response(
                {
                    'error': 'Your account credit score is too low to submit new requests. Contact an administrator.',
                    'code': 'CREDIT_SCORE_DISABLED',
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

        # AI-assisted auto-decision (deterministic rules; OFF by default).
        self._maybe_auto_decide(req, item, request)

        # Only notify staff about a NEW request if it still needs a human —
        # auto-approved/rejected requests already notified the requester.
        if req.status == Request.Status.PENDING:
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

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Direct request deletion is not allowed.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def _maybe_auto_decide(self, req, item, request):
        """Run the deterministic rule engine on a freshly-created PENDING request.
        No-op unless auto-decision is enabled. The decision is rule-based; the AI
        only writes the explanation (templated fallback if it is unavailable)."""
        from . import auto_decision as ad
        from apps.messaging.assistant import templated_decision_note

        config = ad.get_config()
        if config['mode'] == 'off':
            return

        active = Request.objects.filter(
            requested_by=req.requested_by, status__in=OUTSTANDING_STATUSES,
        ).exclude(pk=req.pk).count()
        daily = ad.get_daily_count()
        decision = ad.evaluate(
            is_returnable=item.is_returnable, priority=item.priority, quantity=req.quantity,
            active_borrows=active, daily_count=daily, config=config,
            credit_score=req.requested_by.credit_score,
            overdue_count=req.requested_by.overdue_count,
            stock=item.quantity,
        )
        reason_text = ' '.join(decision.reasons)
        facts = {
            'decision': {ad.AUTO_APPROVE: 'approve', ad.AUTO_REJECT: 'reject', ad.NEEDS_REVIEW: 'review'}[decision.action],
            'item_name': req.item_name, 'category': item.category, 'is_returnable': item.is_returnable,
            'priority': item.priority, 'quantity': req.quantity, 'stock': item.quantity,
            'active_borrows': active,
            'credit_score': req.requested_by.credit_score,
            'overdue_count': req.requested_by.overdue_count,
            'reasons': decision.reasons,
        }
        req.auto_recommendation = ad.RECOMMENDATION[decision.action]
        # Deterministic, instant note — the LLM is intentionally kept OUT of the
        # request-create path (it can take many seconds and would hang submits).
        req.auto_note = templated_decision_note(facts)

        # suggest mode (or anything not 'auto'): record the recommendation, leave PENDING.
        if config['mode'] != 'auto':
            req.save(update_fields=['auto_recommendation', 'auto_note'])
            return

        if decision.action == ad.AUTO_APPROVE:
            with transaction.atomic():
                ok, error = self._apply_approval(req, None, request=request, auto=True)
            if ok:
                req.auto_decided = True
                req.save(update_fields=['auto_recommendation', 'auto_note', 'auto_decided'])
                ad.increment_daily_count()
            else:
                # Stock vanished in a race → leave it PENDING for staff.
                req.auto_note = f'{req.auto_note} (Could not auto-approve: {error})'
                req.save(update_fields=['auto_recommendation', 'auto_note'])
        elif decision.action == ad.AUTO_REJECT:
            with transaction.atomic():
                self._apply_rejection(req, None, reason_text, request=request, auto=True)
            req.auto_decided = True
            req.save(update_fields=['auto_recommendation', 'auto_note', 'auto_decided'])
        else:  # NEEDS_REVIEW
            req.save(update_fields=['auto_recommendation', 'auto_note'])

    @staticmethod
    def _ensure_pending(req, action_verb):
        """Return an error response when a request is no longer pending."""
        if req.status != 'PENDING':
            return Response(
                {'error': f'Only pending requests can be {action_verb}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return None

    def _get_locked_request(self, request, pk):
        """Fetch a request row locked for a state-changing action."""
        queryset = Request.objects.select_for_update().filter(is_cleared=False)
        if not request.user.has_min_role('STAFF'):
            queryset = queryset.filter(requested_by=request.user)
        req = get_object_or_404(queryset, pk=pk)
        self.check_object_permissions(request, req)
        return req

    def _apply_approval(self, req, actor, request=None, auto=False):
        """Reserve stock and mark a pending request approved, then audit
        + notify the requester. Returns (ok, error). Must run inside a transaction.
        Shared by the staff approve() action and the auto-decision path
        (actor=None means the system/auto-rule)."""
        from apps.inventory.models import Item
        item = req.item
        updated = Item.objects.filter(
            pk=item.pk, quantity__gte=req.quantity,
        ).update(quantity=F('quantity') - req.quantity)
        if not updated:
            item.refresh_from_db()
            return False, f'Insufficient stock. Only {item.quantity} available, but {req.quantity} requested.'

        item.refresh_from_db()
        if item.quantity == 0:
            item.status = 'IN_USE'
            item.save(update_fields=['status'])

        req.approved_by = actor
        req.approved_at = timezone.now()
        req.status = 'APPROVED'
        if item.is_returnable and item.borrow_duration:
            delta = item.get_return_timedelta()
            if delta:
                req.expected_return = timezone.now() + delta
        req.save()

        log_action(
            AuditLog.REQUEST_AUTO_APPROVED if auto else AuditLog.REQUEST_APPROVED,
            user=actor,
            details=f'{"[AUTO] " if auto else ""}Approved request #{req.id} for "{req.item_name}" (qty: {req.quantity})',
            request=request,
        )
        approver = (actor.get_full_name() or actor.username) if actor else 'PLMun auto-approval'
        create_notif_if_new(
            recipient=req.requested_by, request_obj=req, notif_type='STATUS_CHANGE',
            message=f'{approver} approved your request for "{req.item_name}"',
            sender=actor,
        )
        return True, None

    def _apply_rejection(self, req, actor, reason, request=None, auto=False):
        """Mark a pending request rejected (no stock change), then audit + notify.
        Shared by reject() and the auto-decision path (actor=None = system)."""
        req.status = 'REJECTED'
        req.approved_by = actor
        req.approved_at = timezone.now()
        req.rejection_reason = reason or ''
        req.save()

        log_action(
            AuditLog.REQUEST_AUTO_REJECTED if auto else AuditLog.REQUEST_REJECTED,
            user=actor,
            details=f'{"[AUTO] " if auto else ""}Rejected request #{req.id} for "{req.item_name}". Reason: {reason or "(none)"}',
            request=request,
        )
        rejector = (actor.get_full_name() or actor.username) if actor else 'PLMun auto-rejection'
        reason_text = f' Reason: "{reason}"' if reason else ''
        create_notif_if_new(
            recipient=req.requested_by, request_obj=req, notif_type='STATUS_CHANGE',
            message=f'{rejector} rejected your request for "{req.item_name}".{reason_text}',
            sender=actor,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a pending request, reserve stock, and notify the requester."""
        with transaction.atomic():
            req = self._get_locked_request(request, pk)

            guard = self._ensure_pending(req, 'approved')
            if guard:
                return guard

            # Prevent self-approval (requester cannot approve their own request).
            # This guard is intentionally only on the manual action — the auto path
            # acts as the system, not the requester.
            if req.requested_by == request.user:
                return Response(
                    {'error': 'You cannot approve your own request'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            ok, error = self._apply_approval(req, request.user, request=request)
            if not ok:
                return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

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

            self._apply_rejection(
                req, request.user, serializer.validated_data.get('reason', ''), request=request,
            )

        return Response(RequestSerializer(req).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        with transaction.atomic():
            req = self._get_locked_request(request, pk)

            if not request.user.has_min_role('STAFF'):
                return Response(
                    {'error': 'Staff access required to complete requests'},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if req.status != 'APPROVED':
                return Response(
                    {'error': 'Only approved requests can be completed'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Returnable items must go through the return handshake.
            if req.item.is_returnable:
                return Response(
                    {'error': 'Returnable items must be returned (use the return flow), not completed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            req.status = 'COMPLETED'
            req.save(update_fields=['status', 'updated_at'])

        # Let the requester know.
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
        with transaction.atomic():
            req = self._get_locked_request(request, pk)

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
            req.save(update_fields=['status', 'updated_at'])

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
        with transaction.atomic():
            req = self._get_locked_request(request, pk)

            if req.requested_by != request.user and not request.user.has_min_role('STAFF'):
                return Response(
                    {'error': 'You can only return your own borrowed items'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if req.status != 'APPROVED':
                return Response(
                    {'error': 'Only approved requests can be returned'},
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
            User.objects.filter(role__in=['STAFF', 'ADMIN'], is_active=True).exclude(id=request.user.id),
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

            now = timezone.now()
            was_late = bool(req.expected_return and now > req.expected_return)
            was_early = bool(req.expected_return and now < req.expected_return)
            # Persistent ledger, not notification existence (notifications are deletable).
            overdue_already_counted = req.overdue_penalty_applied

            # Restore stock atomically now that receipt is confirmed.
            item = req.item
            Item.objects.filter(pk=item.pk).update(quantity=F('quantity') + req.quantity)
            item.refresh_from_db()
            if item.status == 'IN_USE':
                item.status = 'AVAILABLE'
                item.save(update_fields=['status'])

            # A confirmed return is RETURNED (distinct from a consumable being
            # marked COMPLETED) so the "Returned" progress step and stat are real.
            req.status = 'RETURNED'
            req.returned_at = now
            req.return_confirmed_by = request.user
            req.save(update_fields=['status', 'returned_at', 'return_confirmed_by', 'updated_at'])

            borrower = req.requested_by
            if was_early:
                borrower.apply_credit_change(2, early_returns=1)
            elif was_late and not overdue_already_counted:
                borrower.apply_credit_change(-5, late_incidents=1)
                Request.objects.filter(pk=req.pk).update(overdue_penalty_applied=True)

            # The item is back — clear any lingering OVERDUE alerts for it so a
            # returned item never keeps showing as overdue in the bell.
            Notification.objects.filter(request=req, type='OVERDUE').delete()

            # Auto-unflag the borrower if they have no remaining outstanding overdue items.
            remaining_overdue = Request.objects.filter(
                requested_by=borrower,
                status__in=OUTSTANDING_STATUSES,
                expected_return__lt=now,
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
        if not request.user.has_min_role('STAFF'):
            return Response(
                {'error': 'Staff access required to clear requests'},
                status=status.HTTP_403_FORBIDDEN,
            )

        qs = self.get_queryset().filter(status__in=CLEARABLE_STATUSES)
        clearable_ids = list(qs.values_list('id', flat=True))
        count = qs.update(is_cleared=True)  # soft-delete: keep for reports/charts
        notifications_cleared = Notification.objects.filter(request_id__in=clearable_ids).delete()[0]

        # Audit log
        log_action(AuditLog.OTHER, user=request.user,
                   details=f'Cleared {count} completed/returned/rejected/cancelled requests',
                   request=request)

        return Response({
            'status': f'{count} requests cleared',
            'notificationsCleared': notifications_cleared,
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        # One aggregate query with conditional counts instead of 7 round-trips.
        # Period-scope the request counts by ?range= (week/month/quarter/year/all).
        # 'overdue' is a current-state metric and is never range-scoped.
        qs = self._report_base_qs()
        range_key = request.query_params.get('range', 'all')
        start = get_range_start(range_key)
        period_qs = qs if start is None else qs.filter(created_at__gte=start)

        APPROVED_SET = ['APPROVED', 'COMPLETED', 'RETURNED']
        DECIDED_EXTRA = ['REJECTED', 'CANCELLED']
        agg = period_qs.aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='PENDING')),
            approved=Count('id', filter=Q(status='APPROVED')),
            completed=Count('id', filter=Q(status__in=['COMPLETED', 'RETURNED'])),
            rejected=Count('id', filter=Q(status='REJECTED')),
            returned=Count('id', filter=Q(status='RETURNED')),
            _approved_set=Count('id', filter=Q(status__in=APPROVED_SET)),
            _decided_extra=Count('id', filter=Q(status__in=DECIDED_EXTRA)),
        )
        approved_set = agg.pop('_approved_set')
        decided_total = approved_set + agg.pop('_decided_extra')
        # Approval rate = approved (incl. completed/returned) vs all decided requests.
        agg['approvalRate'] = round(approved_set / decided_total * 100) if decided_total else 0
        agg['overdue'] = qs.filter(
            status__in=OUTSTANDING_STATUSES,
            expected_return__lt=timezone.now(),
        ).count()
        agg['range'] = range_key
        return Response(agg)

    @action(detail=False, methods=['get', 'post'], permission_classes=[IsAdmin])
    def auto_decision_config(self, request):
        """Admin-only: read/update the AI auto-decision config (cache-backed, OFF
        by default). GET returns the effective config; POST updates it (audited)."""
        from . import auto_decision as ad
        if request.method == 'GET':
            return Response(ad.get_config())
        config = ad.set_config(request.data or {})
        log_action(
            AuditLog.OTHER, user=request.user,
            details=(f'Auto-decision config updated: mode={config["mode"]}, '
                     f'max_auto_qty={config["max_auto_qty"]}, daily_cap={config["daily_cap"]}, '
                     f'max_active_borrows={config["max_active_borrows"]}, reject_over_qty={config["reject_over_qty"]}'),
            request=request,
        )
        return Response(config)

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

        clearable = Request.objects.filter(status__in=CLEARABLE_STATUSES)
        clearable_ids = list(clearable.values_list('id', flat=True))
        notifications_cleared = Notification.objects.filter(request_id__in=clearable_ids).delete()[0]
        count, _ = clearable.delete()

        log_action(
            AuditLog.OTHER,
            user=request.user,
            details=f'Cleared {count} request history records',
            request=request,
        )

        return Response({
            'status': f'{count} history records cleared',
            'notificationsCleared': notifications_cleared,
        })

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
        """Run the overdue scan for signed-in users.
        The scan is idempotent and returns only a summary."""
        result = run_overdue_scan()
        return Response({'status': f"{result['notified']} overdue notifications created"})

    @action(detail=False, methods=['get'])
    def popular_items(self, request):
        """Top requested items in the selected range, grouped by item (stable
        across renames). Sums requested quantity. Feeds the Reports chart."""
        qs = self._report_base_qs()
        start = get_range_start(request.query_params.get('range', 'all'))
        if start is not None:
            qs = qs.filter(created_at__gte=start)
        rows = (
            qs.values('item_id', 'item__name')
              .annotate(count=Sum('quantity'))
              .order_by('-count')[:8]
        )
        return Response([
            {
                'itemId': r['item_id'],
                'name': r['item__name'] or 'Unknown',
                'count': r['count'] or 0,
            }
            for r in rows
        ])

    @action(detail=False, methods=['get'])
    def overdue_grouped(self, request):
        """Overdue outstanding requests grouped by borrower, for the Reports
        overdue panel. Optional ?search= matches borrower name or item name."""
        now = timezone.now()
        qs = (
            self._report_base_qs()
            .filter(status__in=OUTSTANDING_STATUSES, expected_return__lt=now)
            .select_related('requested_by')
        )
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(requested_by__first_name__icontains=search) |
                Q(requested_by__last_name__icontains=search) |
                Q(requested_by__username__icontains=search) |
                Q(item_name__icontains=search)
            )
        groups = {}
        for req in qs.order_by('expected_return'):
            borrower = req.requested_by
            group = groups.get(borrower.id)
            if group is None:
                group = {
                    'borrowerId': borrower.id,
                    'borrowerName': borrower.get_full_name() or borrower.username,
                    'studentId': getattr(borrower, 'student_id', '') or '',
                    'count': 0,
                    'maxDaysOverdue': 0,
                    'items': [],
                }
                groups[borrower.id] = group
            days_overdue = (now - req.expected_return).days
            group['count'] += 1
            group['maxDaysOverdue'] = max(group['maxDaysOverdue'], days_overdue)
            group['items'].append({
                'id': req.id,
                'itemName': req.item_name,
                'quantity': req.quantity,
                'expectedReturn': req.expected_return.isoformat(),
                'daysOverdue': days_overdue,
                'status': req.status,
            })
        return Response(sorted(groups.values(), key=lambda g: g['maxDaysOverdue'], reverse=True))


class NotificationViewSet(viewsets.ModelViewSet):
    """Authenticated user's notifications."""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
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

