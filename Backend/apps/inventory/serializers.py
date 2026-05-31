from rest_framework import serializers
from django.utils.html import strip_tags
from typing import Optional
from .models import Item


class ItemSerializer(serializers.ModelSerializer):
    """Read serializer para sa items. CamelCase kasi gusto ng frontend."""
    # medyo maraming fields 'to pero kailangan talaga lahat para sa detail view

    isLowStock = serializers.SerializerMethodField()
    isOutOfStock = serializers.SerializerMethodField()
    dateAdded = serializers.DateTimeField(source='created_at', read_only=True)
    accessLevel = serializers.CharField(source='access_level')
    imageUrl = serializers.ImageField(source='image', required=False, allow_null=True)
    isReturnable = serializers.BooleanField(source='is_returnable', read_only=True)
    borrowDuration = serializers.IntegerField(source='borrow_duration', read_only=True, allow_null=True)
    borrowDurationUnit = serializers.CharField(source='borrow_duration_unit', read_only=True)

    # Status metadata
    statusNote = serializers.CharField(source='status_note', read_only=True, default='')
    statusChangedAt = serializers.DateTimeField(source='status_changed_at', read_only=True, allow_null=True)
    statusChangedByName = serializers.SerializerMethodField()
    maintenanceEta = serializers.DateTimeField(source='maintenance_eta', read_only=True, allow_null=True)

    class Meta:
        model = Item
        fields = [
            'id', 'name', 'brand', 'category', 'quantity', 'status', 'location',
            'description', 'imageUrl', 'accessLevel', 'dateAdded',
            'isLowStock', 'isOutOfStock', 'isReturnable', 'priority',
            'borrowDuration', 'borrowDurationUnit',
            'statusNote', 'statusChangedAt', 'statusChangedByName', 'maintenanceEta',
        ]
        read_only_fields = ['id', 'dateAdded', 'isLowStock', 'isOutOfStock']

    def get_isLowStock(self, obj) -> bool:
        return obj.is_low_stock

    def get_isOutOfStock(self, obj) -> bool:
        return obj.is_out_of_stock

    def get_statusChangedByName(self, obj) -> Optional[str]:
        if obj.status_changed_by:
            full = obj.status_changed_by.get_full_name()
            return full if full.strip() else obj.status_changed_by.email
        return None


class ItemCreateUpdateSerializer(serializers.ModelSerializer):
    """Write serializer - mas kaunti yung fields kasi di naman lahat editable."""

    accessLevel = serializers.CharField(source='access_level', required=False)
    imageUrl = serializers.ImageField(source='image', required=False, allow_null=True)
    isReturnable = serializers.BooleanField(source='is_returnable', required=False)
    borrowDuration = serializers.IntegerField(source='borrow_duration', required=False, allow_null=True)
    borrowDurationUnit = serializers.CharField(source='borrow_duration_unit', required=False)

    class Meta:
        model = Item
        fields = [
            'name', 'brand', 'category', 'quantity', 'status', 'location',
            'description', 'imageUrl', 'accessLevel', 'isReturnable', 'priority',
            'borrowDuration', 'borrowDurationUnit',
        ]

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError('Quantity cannot be negative.')
        return value

    def validate_name(self, value):
        # strip_tags para di ma-inject ng <script> sa name haha
        return strip_tags(value).strip()

    def validate_brand(self, value):
        """Strip HTML tags to prevent stored XSS in print/export views."""
        if value:
            return strip_tags(value).strip()
        return value

    def validate_description(self, value):
        """Strip HTML tags to prevent stored XSS."""
        if value:
            return strip_tags(value).strip()
        return value

    def validate_location(self, value):
        """Strip HTML tags to prevent stored XSS in print/export views."""
        if value:
            return strip_tags(value).strip()
        return value

    def validate_accessLevel(self, value):
        """A user cannot mark an item at an access level above their own role
        (e.g. STAFF cannot create ADMIN-only items)."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and value and not user.has_min_role(value):
            raise serializers.ValidationError(
                'You cannot assign an access level higher than your own role.'
            )
        return value

