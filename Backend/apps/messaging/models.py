from django.db import models
from django.conf import settings


def dm_key_for_user_ids(user_a_id, user_b_id):
    """Stable key for a 2-person direct message, independent of sender order."""
    if not user_a_id or not user_b_id or int(user_a_id) == int(user_b_id):
        return None
    left, right = sorted([int(user_a_id), int(user_b_id)])
    return f'{left}-{right}'


def can_message(user_a, user_b):
    """A direct message is allowed only if at least one participant is
    Staff or Admin. (Students/Faculty can only reach the support side;
    Staff/Admin can reach anyone.)"""
    if not user_a or not user_b or user_a.id == user_b.id:
        return False
    return bool(getattr(user_a, 'is_staff_or_above', False) or getattr(user_b, 'is_staff_or_above', False))


class Conversation(models.Model):
    """A direct (2-party) conversation. Modeled generically so group threads
    could be added later."""

    created_at = models.DateTimeField(auto_now_add=True)
    # Touched whenever a new message arrives, so the inbox can sort by recency.
    updated_at = models.DateTimeField(auto_now=True)
    dm_key = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text='Sorted member-id pair for 2-person direct messages.',
    )

    class Meta:
        db_table = 'conversations'
        ordering = ['-updated_at']

    def __str__(self):
        return f"Conversation #{self.pk}"


class ConversationMember(models.Model):
    """A user's membership in a conversation. `last_read_at` drives unread
    counts AND read-receipts (no per-message read rows — scalable)."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversation_memberships')
    last_read_at = models.DateTimeField(null=True, blank=True)
    is_archived = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    cleared_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'conversation_members'
        unique_together = ('conversation', 'user')
        indexes = [
            models.Index(fields=['user', 'is_archived']),
            models.Index(fields=['user', 'deleted_at']),
        ]

    def __str__(self):
        return f"{self.user_id} in conv {self.conversation_id}"


class Message(models.Model):
    """A single chat message. May optionally reference an inventory Item
    (the "refer an item" feature) and/or carry an image attachment."""

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_messages')
    body = models.TextField(blank=True)
    item = models.ForeignKey(
        'inventory.Item', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='referenced_in_messages',
        help_text='Optional inventory item this message refers to.',
    )
    attachment = models.ImageField(upload_to='chat/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'messages'
        ordering = ['created_at']
        indexes = [models.Index(fields=['conversation', 'created_at'])]

    def __str__(self):
        return f"Message #{self.pk} in conv {self.conversation_id}"


class MessageReaction(models.Model):
    """An emoji reaction by one user on one message. One row per (message, user,
    emoji) — toggling deletes/recreates."""

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='message_reactions')
    emoji = models.CharField(max_length=16)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'message_reactions'
        unique_together = ('message', 'user', 'emoji')

    def __str__(self):
        return f"{self.emoji} by {self.user_id} on msg {self.message_id}"
