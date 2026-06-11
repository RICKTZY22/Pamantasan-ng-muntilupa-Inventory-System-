from django.contrib.auth.models import AbstractUser
from django.db import models
from apps.common.uploads import avatar_upload_path

class User(AbstractUser):
    """Custom user model with app roles and profile metadata."""

    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Student'
        FACULTY = 'FACULTY', 'Faculty'
        STAFF = 'STAFF', 'Staff'
        ADMIN = 'ADMIN', 'Admin'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
        db_index=True,
    )
    department = models.CharField(max_length=100, blank=True)
    student_id = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to=avatar_upload_path, null=True, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    is_flagged = models.BooleanField(default=False, help_text='Flagged for overdue returns')
    overdue_count = models.PositiveIntegerField(default=0, help_text='Lifetime overdue incidents (never reset)')
    credit_score = models.PositiveSmallIntegerField(default=100, help_text='Borrower credit score from 0 to 100')
    early_return_count = models.PositiveIntegerField(default=0, help_text='Lifetime early confirmed returns')

    CREDIT_MIN = 0
    CREDIT_MAX = 100
    CREDIT_DISABLE_THRESHOLD = 75

    def apply_credit_change(self, delta, *, late_incidents=0, early_returns=0):
        """Apply a borrower score change and disable risky non-staff accounts."""
        current = int(self.credit_score if self.credit_score is not None else self.CREDIT_MAX)
        self.credit_score = max(self.CREDIT_MIN, min(self.CREDIT_MAX, current + int(delta)))
        update_fields = ['credit_score']

        if late_incidents:
            self.overdue_count += int(late_incidents)
            self.is_flagged = True
            update_fields.extend(['overdue_count', 'is_flagged'])

        if early_returns:
            self.early_return_count += int(early_returns)
            update_fields.append('early_return_count')

        # Strictly BELOW the threshold disables the account: at exactly 75 the
        # borrower keeps access; one more incident tips them under and an admin
        # must restore the account (see UserViewSet.restore_credit).
        if self.credit_score < self.CREDIT_DISABLE_THRESHOLD and not self.has_min_role(self.Role.STAFF):
            self.is_active = False
            update_fields.append('is_active')

        self.save(update_fields=sorted(set(update_fields)))
        return self.credit_score

    # Numbering starts at 0 because we compare with >= in has_min_role().
    # Considered using Django's built-in groups/permissions but the role
    # hierarchy is simple enough that a manual approach keeps the codebase
    # smaller and avoids the overhead of Group/Permission M2M tables.
    ROLE_HIERARCHY = {
        'STUDENT': 0,
        'FACULTY': 1,
        'STAFF': 2,
        'ADMIN': 3,
    }

    def has_min_role(self, min_role: str) -> bool:
        """Check if user has at least the specified role."""
        return self.ROLE_HIERARCHY.get(self.role, 0) >= self.ROLE_HIERARCHY.get(min_role, 0)

    @property
    def is_faculty_or_above(self) -> bool:
        return self.has_min_role('FACULTY')

    @property
    def is_staff_or_above(self) -> bool:
        return self.has_min_role('STAFF')

    @property
    def is_admin(self) -> bool:
        return self.role == 'ADMIN'

    class Meta:
        db_table = 'users'
        ordering = ['-date_joined']

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"


class AuditLog(models.Model):
    """Audit trail for security-relevant user and inventory actions."""

    class Action(models.TextChoices):
        LOGIN            = 'Login',           'Login'
        LOGOUT           = 'Logout',          'Logout'
        LOGIN_FAILED     = 'Login Failed',    'Login Failed'
        REGISTER         = 'Register',        'Register'
        PROFILE_UPDATE   = 'Profile Update',  'Profile Update'
        PASSWORD_CHANGE  = 'Password Changed','Password Changed'
        ITEM_CREATED     = 'Item Created',    'Item Created'
        ITEM_UPDATED     = 'Item Updated',    'Item Updated'
        ITEM_DELETED     = 'Item Deleted',    'Item Deleted'
        REQUEST_CREATED  = 'Request Created', 'Request Created'
        REQUEST_APPROVED = 'Request Approved','Request Approved'
        REQUEST_REJECTED = 'Request Rejected','Request Rejected'
        REQUEST_AUTO_APPROVED = 'Request Auto-Approved','Request Auto-Approved'
        REQUEST_AUTO_REJECTED = 'Request Auto-Rejected','Request Auto-Rejected'
        REQUEST_RETURNED = 'Item Returned',   'Item Returned'
        USER_CREATED     = 'User Created',    'User Created'
        USER_UPDATED     = 'User Updated',    'User Updated'
        USER_DELETED     = 'User Deleted',    'User Deleted'
        BACKUP           = 'Backup Export',   'Backup Export'
        OTHER            = 'Other',           'Other'

    # Keep class-level shortcuts for backwards-compatible call sites
    LOGIN           = Action.LOGIN
    LOGOUT          = Action.LOGOUT
    LOGIN_FAILED    = Action.LOGIN_FAILED
    REGISTER        = Action.REGISTER
    PROFILE_UPDATE  = Action.PROFILE_UPDATE
    PASSWORD_CHANGE = Action.PASSWORD_CHANGE
    ITEM_CREATED    = Action.ITEM_CREATED
    ITEM_UPDATED    = Action.ITEM_UPDATED
    ITEM_DELETED    = Action.ITEM_DELETED
    REQUEST_CREATED  = Action.REQUEST_CREATED
    REQUEST_APPROVED = Action.REQUEST_APPROVED
    REQUEST_REJECTED = Action.REQUEST_REJECTED
    REQUEST_AUTO_APPROVED = Action.REQUEST_AUTO_APPROVED
    REQUEST_AUTO_REJECTED = Action.REQUEST_AUTO_REJECTED
    REQUEST_RETURNED = Action.REQUEST_RETURNED
    USER_CREATED    = Action.USER_CREATED
    USER_UPDATED    = Action.USER_UPDATED
    USER_DELETED    = Action.USER_DELETED
    BACKUP          = Action.BACKUP
    OTHER           = Action.OTHER

    action     = models.CharField(max_length=60, choices=Action.choices)
    user       = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='audit_logs',
    )
    username   = models.CharField(max_length=150, blank=True)
    details    = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    timestamp  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.action} — {self.username}"


def log_action(action, user=None, details='', request=None):
    """Convenience helper to create an AuditLog entry from anywhere."""
    ip = None
    if request:
        x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        ip = x_forwarded.split(',')[0].strip() if x_forwarded else request.META.get('REMOTE_ADDR')
    AuditLog.objects.create(
        action=action,
        user=user if (user and user.is_authenticated) else None,
        username=user.username if (user and user.is_authenticated) else '',
        details=details,
        ip_address=ip,
    )
