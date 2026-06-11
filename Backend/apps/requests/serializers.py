from rest_framework import serializers
from django.utils import timezone
from django.utils.html import strip_tags
from typing import Optional
from .models import Request, Notification
from .overdue import OUTSTANDING_STATUSES


class RequestSerializer(serializers.ModelSerializer):

    borrower = serializers.SerializerMethodField()
    requestedBy = serializers.SerializerMethodField()
    requestedById = serializers.IntegerField(source='requested_by_id', read_only=True)
    requestedByStudentId = serializers.SerializerMethodField()
    approvedBy = serializers.SerializerMethodField()
    itemName = serializers.CharField(source='item_name', read_only=True)
    requestDate = serializers.DateField(source='request_date', read_only=True)
    expectedReturn = serializers.DateTimeField(source='expected_return', allow_null=True, required=False)
    approvedAt = serializers.DateTimeField(source='approved_at', read_only=True)
    rejectionReason = serializers.CharField(source='rejection_reason', read_only=True)
    returnedAt = serializers.DateTimeField(source='returned_at', read_only=True)
    returnRequestedAt = serializers.DateTimeField(source='return_requested_at', read_only=True)
    returnRequestedByName = serializers.SerializerMethodField()
    returnConfirmedByName = serializers.SerializerMethodField()
    isReturnable = serializers.SerializerMethodField()
    isOverdue = serializers.SerializerMethodField()
    borrowDuration = serializers.SerializerMethodField()
    borrowDurationUnit = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    autoRecommendation = serializers.CharField(source='auto_recommendation', read_only=True)
    autoNote = serializers.CharField(source='auto_note', read_only=True)
    autoDecided = serializers.BooleanField(source='auto_decided', read_only=True)

    class Meta:
        model = Request
        fields = [
            'id', 'item', 'itemName', 'borrower', 'requestedBy', 'requestedById', 'requestedByStudentId',
            'quantity', 'purpose', 'status', 'priority', 'requestDate', 'expectedReturn',
            'approvedBy', 'approvedAt', 'rejectionReason', 'returnedAt',
            'returnRequestedAt', 'returnRequestedByName', 'returnConfirmedByName',
            'isReturnable', 'isOverdue', 'borrowDuration', 'borrowDurationUnit', 'createdAt',
            'autoRecommendation', 'autoNote', 'autoDecided',
        ]
        read_only_fields = [
            'id', 'borrower', 'requestedBy', 'requestedById', 'requestedByStudentId',
            'requestDate', 'approvedBy', 'approvedAt',
            'rejectionReason', 'returnedAt', 'returnRequestedAt',
            'returnRequestedByName', 'returnConfirmedByName',
            'isReturnable', 'isOverdue',
            'borrowDuration', 'borrowDurationUnit', 'createdAt', 'itemName',
            # State/identity fields only ever change via the action endpoints,
            # never a direct write — read-only as defense in depth.
            'status', 'priority', 'item', 'quantity',
            'autoRecommendation', 'autoNote', 'autoDecided',
        ]

    def _borrower_payload(self, user, *, include_staff_fields=False):
        request = self.context.get('request')
        avatar_url = None
        if getattr(user, 'avatar', None):
            avatar_url = request.build_absolute_uri(user.avatar.url) if request else user.avatar.url

        payload = {
            'id': user.id,
            'fullName': user.get_full_name() or user.username,
            'username': user.username,
            'studentId': getattr(user, 'student_id', '') or '',
            'role': user.role,
            'department': user.department or '',
            'avatarUrl': avatar_url,
        }
        if include_staff_fields:
            payload.update({
                'email': user.email,
                'isActive': user.is_active,
                'isFlagged': user.is_flagged,
                'overdueCount': user.overdue_count,
                'creditScore': user.credit_score,
                'earlyReturnCount': user.early_return_count,
            })
        return payload

    def get_borrower(self, obj):
        viewer = getattr(self.context.get('request'), 'user', None)
        if not viewer or not getattr(viewer, 'is_authenticated', False):
            return None

        borrower = obj.requested_by
        if viewer.has_min_role('STAFF'):
            return self._borrower_payload(borrower, include_staff_fields=True)
        if viewer.id == obj.requested_by_id:
            return self._borrower_payload(borrower, include_staff_fields=True)
        return None

    def get_requestedBy(self, obj) -> str:
        return obj.requested_by.get_full_name() or obj.requested_by.username

    def get_requestedByStudentId(self, obj) -> str:
        return getattr(obj.requested_by, 'student_id', '') or ''

    def get_approvedBy(self, obj) -> Optional[str]:
        if obj.approved_by:
            return obj.approved_by.get_full_name() or obj.approved_by.username
        return None

    def get_isReturnable(self, obj) -> bool:
        # If the item was deleted after the request was made, treat it safely.
        try:
            return obj.item.is_returnable
        except (AttributeError, obj.item.DoesNotExist):
            return False

    def get_returnRequestedByName(self, obj) -> Optional[str]:
        if obj.return_requested_by:
            return obj.return_requested_by.get_full_name() or obj.return_requested_by.username
        return None

    def get_returnConfirmedByName(self, obj) -> Optional[str]:
        if obj.return_confirmed_by:
            return obj.return_confirmed_by.get_full_name() or obj.return_confirmed_by.username
        return None

    def get_isOverdue(self, obj) -> bool:
        if obj.status not in OUTSTANDING_STATUSES:
            return False
        if not obj.expected_return:
            return False
        return obj.expected_return < timezone.now()

    def get_borrowDuration(self, obj) -> Optional[int]:
        try:
            return obj.item.borrow_duration
        except (AttributeError, obj.item.DoesNotExist):
            return None

    def get_borrowDurationUnit(self, obj) -> Optional[str]:
        try:
            return obj.item.borrow_duration_unit
        except (AttributeError, obj.item.DoesNotExist):
            return None


class RequestCreateSerializer(serializers.ModelSerializer):

    itemName = serializers.CharField(source='item_name', required=False, allow_blank=True)

    class Meta:
        model = Request
        # expectedReturn is intentionally NOT writable here — the due date is set
        # server-side on staff approval, never by the borrower at creation.
        fields = ['item', 'itemName', 'quantity', 'purpose']

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError('Quantity must be at least 1.')
        return value

    def validate(self, attrs):
        """Validate item visibility, availability, and requested quantity."""
        item = attrs.get('item')
        quantity = attrs.get('quantity', 1)
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if not item:
            return attrs

        if user and not user.has_min_role(item.access_level):
            raise serializers.ValidationError({
                'item': 'You are not allowed to request this item.'
            })

        if item.status != 'AVAILABLE':
            raise serializers.ValidationError({
                'item': 'Only available items can be requested.'
            })

        if quantity > item.quantity:
            raise serializers.ValidationError({
                'quantity': f'Only {item.quantity} available in stock. You requested {quantity}.'
            })
        return attrs

    def validate_purpose(self, value):
        """Strip HTML tags to prevent stored XSS."""
        if value:
            return strip_tags(value).strip()
        return value

    def validate_itemName(self, value):
        """Strip HTML tags from the denormalized item name snapshot."""
        if value:
            return strip_tags(value).strip()
        return value


class RequestActionSerializer(serializers.Serializer):
    """Approve/reject payload — just an optional reason."""

    reason = serializers.CharField(required=False, allow_blank=True)

    def validate_reason(self, value):
        """Strip HTML tags before storing rejection reasons or notifications."""
        if value:
            return strip_tags(value).strip()
        return value


class NotificationSerializer(serializers.ModelSerializer):

    senderName = serializers.SerializerMethodField()
    itemName = serializers.SerializerMethodField()
    requestId = serializers.IntegerField(source='request_id', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    isRead = serializers.BooleanField(source='is_read', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'message', 'isRead', 'senderName', 'itemName', 'requestId', 'createdAt']
        # System-generated: a user PATCH must not rewrite type/message; only the
        # custom read() action flips is_read.
        read_only_fields = ['type', 'message']

    def get_senderName(self, obj) -> Optional[str]:
        if obj.sender:
            return obj.sender.get_full_name() or obj.sender.username
        return None

    def get_itemName(self, obj) -> Optional[str]:
        if obj.request:
            return obj.request.item_name
        return None

