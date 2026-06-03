from django.db import models
from django.conf import settings


class Request(models.Model):
    """Borrow request model for approval and return tracking."""

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'
        COMPLETED = 'COMPLETED', 'Completed'
        # Borrower has signalled a return; awaiting staff confirmation of
        # physical receipt before it counts as actually returned.
        RETURN_PENDING = 'RETURN_PENDING', 'Return Pending'
        RETURNED = 'RETURNED', 'Returned'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'


    item = models.ForeignKey(
        'inventory.Item',
        on_delete=models.CASCADE,
        related_name='requests',
    )
    # Denormalized on purpose: we snapshot the item name at request time
    # so that if the item gets renamed later, the request history still
    # shows what the user originally asked for. Tried using item.name
    # directly but it confused staff when item names changed mid-borrow.
    item_name = models.CharField(max_length=200)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='requests',
    )
    quantity = models.PositiveIntegerField(default=1)
    purpose = models.TextField()


    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )
    priority = models.CharField(
        max_length=20,
        choices=Priority.choices,
        default=Priority.MEDIUM,
    )


    request_date = models.DateField(auto_now_add=True)
    expected_return = models.DateTimeField(null=True, blank=True)

    # Approval details
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_requests',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Two-step return handshake: the borrower (or staff) requests a return,
    # then a staff/admin confirms physical receipt. This prevents a single
    # accidental click from closing out an item that was never handed back.
    return_requested_at = models.DateTimeField(null=True, blank=True)
    return_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='return_requests',
    )
    return_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='confirmed_returns',
    )
    returned_at = models.DateTimeField(null=True, blank=True)

    # Soft-delete: cleared requests stay in DB for reports/charts
    # but are hidden from the active requests list.
    is_cleared = models.BooleanField(default=False)


    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'requests'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.item_name} - {self.requested_by.get_full_name()} ({self.status})"


class Notification(models.Model):
    """User notification model."""

    class Type(models.TextChoices):
        COMMENT = 'COMMENT', 'Comment'
        STATUS_CHANGE = 'STATUS_CHANGE', 'Status Change'
        REMINDER = 'REMINDER', 'Reminder'
        OVERDUE = 'OVERDUE', 'Overdue'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sent_notifications',
    )
    request = models.ForeignKey(
        Request,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications',
    )
    type = models.CharField(
        max_length=20,
        choices=Type.choices,
        default=Type.COMMENT,
    )
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['recipient', 'request', 'type'],
                condition=models.Q(
                    is_read=False,
                    request__isnull=False,
                    type='OVERDUE',
                ),
                name='uniq_unread_overdue_notification',
            ),
        ]

    def __str__(self):
        return f"Notification for {self.recipient.get_full_name()}: {self.message[:50]}"

