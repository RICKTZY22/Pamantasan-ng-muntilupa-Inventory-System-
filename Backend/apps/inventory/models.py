from django.db import models
from django.conf import settings
from datetime import timedelta


class Item(models.Model):
    """Isa-isang item sa inventory.
    Dati walang access_level, pero hiningi ng registrar kasi may mga
    gamit na para sa faculty lang talaga (e.g. projectors sa faculty room).
    """

    class Status(models.TextChoices):
        AVAILABLE = 'AVAILABLE', 'Available'
        IN_USE = 'IN_USE', 'In Use'
        MAINTENANCE = 'MAINTENANCE', 'Maintenance'
        RETIRED = 'RETIRED', 'Retired'

    class Category(models.TextChoices):
        ELECTRONICS = 'ELECTRONICS', 'Electronics'
        FURNITURE = 'FURNITURE', 'Furniture'
        EQUIPMENT = 'EQUIPMENT', 'Equipment'
        SUPPLIES = 'SUPPLIES', 'Supplies'
        OTHER = 'OTHER', 'Other'

    class AccessLevel(models.TextChoices):
        STUDENT = 'STUDENT', 'Student'
        FACULTY = 'FACULTY', 'Faculty'
        STAFF = 'STAFF', 'Staff'
        ADMIN = 'ADMIN', 'Admin'

    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'

    name = models.CharField(max_length=200)
    category = models.CharField(
        max_length=50,
        choices=Category.choices,
        default=Category.ELECTRONICS,
    )
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=50,
        choices=Status.choices,
        default=Status.AVAILABLE,
    )
    location = models.CharField(max_length=100, blank=True, default='')
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='items/', null=True, blank=True)
    access_level = models.CharField(
        max_length=20,
        choices=AccessLevel.choices,
        default=AccessLevel.STUDENT,
    )
    is_returnable = models.BooleanField(default=True)
    priority = models.CharField(
        max_length=10,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        help_text='Item importance: LOW (consumables), MEDIUM (standard), HIGH (fragile/expensive)',
    )
    # TODO: mag-add ng 'condition' field para ma-track kung sira na or what

    # Status metadata
    status_note = models.TextField(blank=True, default='', help_text='Reason or note for current status')
    status_changed_at = models.DateTimeField(null=True, blank=True, help_text='When the status was last changed')
    status_changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='status_changes',
        help_text='Who last changed the status',
    )
    maintenance_eta = models.DateTimeField(null=True, blank=True, help_text='Estimated return-to-service date')

    class DurationUnit(models.TextChoices):
        MINUTES = 'MINUTES', 'Minutes'
        HOURS = 'HOURS', 'Hours'
        DAYS = 'DAYS', 'Days'
        MONTHS = 'MONTHS', 'Months'

    borrow_duration = models.PositiveIntegerField(null=True, blank=True, help_text='How long a borrower can keep this item')
    borrow_duration_unit = models.CharField(
        max_length=10,
        choices=DurationUnit.choices,
        default=DurationUnit.DAYS,
    )

    def get_return_timedelta(self):
        """Return the timedelta for this item's borrow duration.
        Uses 30.44 days/month (average Gregorian month length) since
        timedelta doesn't support calendar months natively."""
        if not self.borrow_duration:
            return None
        unit_map = {
            'MINUTES': timedelta(minutes=self.borrow_duration),
            'HOURS':   timedelta(hours=self.borrow_duration),
            'MONTHS':  timedelta(days=int(self.borrow_duration * 30.44)),
            'DAYS':    timedelta(days=self.borrow_duration),
        }
        return unit_map.get(self.borrow_duration_unit)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Default is 5 — configurable via settings.LOW_STOCK_THRESHOLD
    @classmethod
    def get_low_stock_threshold(cls):
        from django.conf import settings as django_settings
        return getattr(django_settings, 'LOW_STOCK_THRESHOLD', 5)

    # Keep backward compat for existing code that references Item.LOW_STOCK_THRESHOLD
    LOW_STOCK_THRESHOLD = 5

    @property
    def is_low_stock(self) -> bool:
        return self.quantity <= self.get_low_stock_threshold() and self.quantity > 0

    @property
    def is_out_of_stock(self) -> bool:
        return self.quantity == 0

    class Meta:
        db_table = 'inventory_items'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.name} ({self.category})"
