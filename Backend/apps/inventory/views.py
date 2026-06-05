from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Count
from django.utils import timezone
from django.utils.html import strip_tags

from .models import Item
from .serializers import ItemSerializer, ItemCreateUpdateSerializer
from apps.authentication.models import User, AuditLog, log_action
from apps.permissions import IsStaffOrAbove


class ItemViewSet(viewsets.ModelViewSet):
    """Inventory item endpoints."""

    queryset = Item.objects.all()

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ItemCreateUpdateSerializer
        return ItemSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        elif self.action in ['create', 'update', 'partial_update', 'destroy', 'change_status']:
            return [IsStaffOrAbove()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save()

        log_action(AuditLog.ITEM_CREATED, user=request.user,
                   details=f'Created item "{item.name}" (category: {item.category}, qty: {item.quantity})',
                   request=request)

        return Response(
            ItemSerializer(item).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        item = serializer.save()

        log_action(AuditLog.ITEM_UPDATED, user=request.user,
                   details=f'Updated item "{item.name}" (id: {item.id})',
                   request=request)

        return Response(ItemSerializer(item).data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        item_name = instance.name
        item_id = instance.id
        response = super().destroy(request, *args, **kwargs)

        log_action(AuditLog.ITEM_DELETED, user=request.user,
                   details=f'Deleted item "{item_name}" (id: {item_id})',
                   request=request)

        return response

    def get_queryset(self):
        """Filter inventory by role and query parameters."""
        queryset = Item.objects.select_related('status_changed_by').all()
        user = self.request.user

        # Users can only see items at or below their role level.
        role_hierarchy = User.ROLE_HIERARCHY
        user_level = role_hierarchy.get(user.role, 0)

        accessible_levels = [
            role for role, level in role_hierarchy.items()
            if level <= user_level
        ]
        queryset = queryset.filter(access_level__in=accessible_levels)

        # Students and faculty should not see retired stock in normal browsing.
        if user.role in ['STUDENT', 'FACULTY']:
            queryset = queryset.exclude(status='RETIRED')

        # Query params
        search = self.request.query_params.get('search', '')
        category = self.request.query_params.get('category', '')
        item_status = self.request.query_params.get('status', '')

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search) |
                Q(location__icontains=search)
            )

        if category:
            queryset = queryset.filter(category=category)

        if item_status:
            queryset = queryset.filter(status=item_status)

        return queryset

    @action(detail=True, methods=['post'])
    def change_status(self, request, pk=None):
        """Change an item's status."""
        item = self.get_object()
        new_status = request.data.get('status')
        note = request.data.get('note', '')
        maintenance_eta = request.data.get('maintenanceEta')

        # Validate status
        valid_statuses = [s[0] for s in Item.Status.choices]
        if not new_status or new_status not in valid_statuses:
            return Response(
                {'detail': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_status = item.status
        item.status = new_status
        item.status_note = strip_tags(note).strip()
        item.status_changed_at = timezone.now()
        item.status_changed_by = request.user

        # Set or clear maintenance ETA. datetime-local inputs from the UI are
        # usually naive, so make them timezone-aware before saving.
        if new_status == 'MAINTENANCE' and maintenance_eta:
            from django.utils.dateparse import parse_datetime
            parsed = parse_datetime(maintenance_eta)
            if parsed is None:
                return Response(
                    {'detail': 'Invalid maintenance ETA. Use an ISO date/time value.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if timezone.is_naive(parsed):
                parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
            item.maintenance_eta = parsed
        else:
            item.maintenance_eta = None

        item.save()

        log_action(AuditLog.ITEM_UPDATED, user=request.user,
                   details=f'Changed status of "{item.name}" from {old_status} to {new_status}'
                           f'{" - " + item.status_note if item.status_note else ""}',
                   request=request)

        return Response(ItemSerializer(item).data)

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get items that are low on stock."""
        items = self.get_queryset().filter(
            quantity__lte=Item.get_low_stock_threshold(),
            quantity__gt=0,
        ).exclude(status='RETIRED').order_by('quantity')

        serializer = ItemSerializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def out_of_stock(self, request):
        """Get out of stock items."""
        items = self.get_queryset().filter(quantity=0)
        serializer = ItemSerializer(items, many=True)
        return Response(serializer.data)

    @staticmethod
    def _inventory_stats(queryset):
        # Shared by /stats/ and /dashboard/ so the counts stay identical.
        threshold = Item.get_low_stock_threshold()
        return queryset.aggregate(
            total=Count('id'),
            available=Count('id', filter=Q(status='AVAILABLE', quantity__gt=0)),
            inUse=Count('id', filter=Q(status='IN_USE')),
            maintenance=Count('id', filter=Q(status='MAINTENANCE')),
            retired=Count('id', filter=Q(status='RETIRED')),
            lowStock=Count('id', filter=Q(quantity__lte=threshold, quantity__gt=0)),
            outOfStock=Count('id', filter=Q(quantity=0)),
        )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get inventory statistics."""
        return Response(self._inventory_stats(self.get_queryset()))

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        """Get inventory, request, low-stock, and category dashboard data."""
        from apps.requests.models import Request
        from apps.requests.overdue import OUTSTANDING_STATUSES

        inv_qs = self.get_queryset()
        threshold = Item.get_low_stock_threshold()

        # Inventory summary and low-stock list use the same role-scoped queryset.
        inventory_stats = self._inventory_stats(inv_qs)

        low_stock_items = inv_qs.filter(
            quantity__lte=threshold, quantity__gt=0,
        ).exclude(status='RETIRED').order_by('quantity')
        low_stock_data = ItemSerializer(low_stock_items, many=True).data

        category_counts = dict(
            inv_qs.values_list('category').annotate(count=Count('id')).values_list('category', 'count')
        )

        # Staff see all requests; borrowers only see their own dashboard counts.
        now = timezone.now()
        if request.user.role in ['STAFF', 'ADMIN']:
            req_qs = Request.objects.all()
        else:
            req_qs = Request.objects.filter(requested_by=request.user)
        overdue_q = Q(status__in=OUTSTANDING_STATUSES, expected_return__lt=now)
        request_stats = req_qs.aggregate(
            total=Count('id'),
            pending=Count('id', filter=Q(status='PENDING')),
            approved=Count('id', filter=Q(status='APPROVED')),
            completed=Count('id', filter=Q(status='COMPLETED')),
            rejected=Count('id', filter=Q(status='REJECTED')),
            returned=Count('id', filter=Q(status='RETURNED')),
            overdue=Count('id', filter=overdue_q),
            highPriority=Count('id', filter=Q(priority='HIGH', status='PENDING')),
        )

        return Response({
            'inventoryStats': inventory_stats,
            'requestStats': request_stats,
            'lowStockItems': low_stock_data,
            'categoryBreakdown': category_counts,
        })
