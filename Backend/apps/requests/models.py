from django.db import models
from django.conf import settings


class Request(models.Model):
    """Borrow request model.
    Medyo maraming fields 'to pero kailangan yung bawat isa para
    sa approval workflow at tracking ng returns.
    """

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'
        COMPLETED = 'COMPLETED', 'Completed'
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


class Comment(models.Model):
    """Comment sa request — para makapag-usap yung staff at borrower."""
    # TODO: mag-add ng edit history para alam kung in-edit yung comment

    request = models.ForeignKey(
        Request,
        on_delete=models.CASCADE,
        related_name='comments',
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='comments',
    )
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'request_comments'
        ordering = ['created_at']

    def __str__(self):
        return f"Comment by {self.author.get_full_name()} on {self.request}"


class Notification(models.Model):
    """Notifications.
    Naka-bulk_create 'to sa views para di mabagal kapag maraming
    staff na kailangang i-notify.
    """

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

    def __str__(self):
        return f"Notification for {self.recipient.get_full_name()}: {self.message[:50]}"

