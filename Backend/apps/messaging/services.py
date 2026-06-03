"""Shared serialization + broadcast helpers so REST responses and WebSocket
events use exactly the same payload shape. Avatars/images are returned as
relative /media URLs (the frontend resolves them) so WS payloads don't need a
request object."""

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from django.db import transaction
from django.utils import timezone

from .models import Conversation, ConversationMember, Message, MessageReaction, dm_key_for_user_ids

ASSISTANT_USERNAME = 'plmun_assistant'


def _media(field):
    try:
        return field.url if field else None
    except ValueError:
        return None


def user_brief(user):
    if not user:
        return None
    is_assistant = user.username == ASSISTANT_USERNAME
    return {
        'id': user.id,
        'name': 'PLMun Assistant' if is_assistant else (user.get_full_name() or user.username),
        'role': user.role,
        'avatar': _media(user.avatar),
        'isAssistant': is_assistant,
    }


def item_brief(item):
    if not item:
        return None
    return {
        'id': item.id,
        'name': item.name,
        'brand': item.brand,
        'category': item.category,
        'quantity': item.quantity,
        'status': item.status,
        'image': _media(item.image),
    }


def serialize_reactions(msg):
    """Aggregate a message's reactions → [{emoji, count, userIds:[...]}]."""
    grouped = {}
    for r in msg.reactions.all():
        g = grouped.setdefault(r.emoji, {'emoji': r.emoji, 'count': 0, 'userIds': []})
        g['count'] += 1
        g['userIds'].append(r.user_id)
    return list(grouped.values())


def serialize_message(msg):
    return {
        'id': msg.id,
        'conversationId': msg.conversation_id,
        'senderId': msg.sender_id,
        'sender': user_brief(msg.sender),
        'body': msg.body,
        'item': item_brief(msg.item),
        'attachment': _media(msg.attachment),
        'reactions': serialize_reactions(msg),
        'createdAt': msg.created_at.isoformat(),
    }


def toggle_reaction(message, user, emoji):
    """Add the reaction if absent, remove it if present. Returns the message's
    aggregated reactions afterward."""
    existing = MessageReaction.objects.filter(message=message, user=user, emoji=emoji).first()
    if existing:
        existing.delete()
    else:
        MessageReaction.objects.create(message=message, user=user, emoji=emoji)
    return serialize_reactions(message)


def serialize_conversation(conv, me):
    """`conv` should come with members__user prefetched."""
    members = list(conv.members.all())
    mine = next((m for m in members if m.user_id == me.id), None)
    other = next((m for m in members if m.user_id != me.id), None)
    visible_messages = conv.messages.all()
    if mine and mine.cleared_at:
        visible_messages = visible_messages.filter(created_at__gt=mine.cleared_at)
    last = visible_messages.order_by('-created_at').first()
    is_assistant = bool(other and other.user.username == ASSISTANT_USERNAME)

    unread = 0
    if mine:
        qs = visible_messages.exclude(sender_id=me.id)
        if mine.last_read_at:
            qs = qs.filter(created_at__gt=mine.last_read_at)
        unread = qs.count()

    return {
        'id': conv.id,
        'other': user_brief(other.user) if other else None,
        'isAssistant': is_assistant,
        'lastMessage': {
            'body': last.body,
            'senderId': last.sender_id,
            'hasItem': bool(last.item_id),
            'createdAt': last.created_at.isoformat(),
        } if last else None,
        'unreadCount': unread,
        'isArchived': mine.is_archived if mine else False,
        'isDeleted': bool(mine and mine.deleted_at),
        'lastReadAt': mine.last_read_at.isoformat() if (mine and mine.last_read_at) else None,
        'otherReadAt': other.last_read_at.isoformat() if (other and other.last_read_at) else None,
        'updatedAt': conv.updated_at.isoformat(),
    }


def create_message(conversation, sender, body='', item=None, attachment=None):
    # Replies should make per-user deleted threads visible again.
    ConversationMember.objects.filter(conversation=conversation, deleted_at__isnull=False).update(deleted_at=None)
    msg = Message.objects.create(conversation=conversation, sender=sender, body=body, item=item, attachment=attachment)
    conversation.save(update_fields=['updated_at'])  # bump recency for the inbox
    return msg


def _prefetched_conversation(pk):
    return Conversation.objects.prefetch_related('members__user').get(pk=pk)


def get_or_create_direct_conversation(user_a, user_b):
    """Return the canonical 2-party conversation and unhide it for both users."""
    dm_key = dm_key_for_user_ids(user_a.id, user_b.id)
    if not dm_key:
        return None, False

    # Support legacy rows that do not have dm_key populated yet.
    candidates = (
        Conversation.objects
        .filter(members__user=user_a)
        .filter(members__user=user_b)
        .prefetch_related('members__user')
        .distinct()
    )
    for conv in candidates:
        if conv.members.count() == 2:
            if conv.dm_key != dm_key:
                conv.dm_key = dm_key
                conv.save(update_fields=['dm_key'])
            ConversationMember.objects.filter(conversation=conv, user__in=[user_a, user_b]).update(deleted_at=None)
            return _prefetched_conversation(conv.pk), False

    with transaction.atomic():
        conv, created = Conversation.objects.get_or_create(dm_key=dm_key)
        for user in (user_a, user_b):
            ConversationMember.objects.get_or_create(conversation=conv, user=user)
        ConversationMember.objects.filter(conversation=conv, user__in=[user_a, user_b]).update(deleted_at=None)

    return _prefetched_conversation(conv.pk), created


def clear_conversation_for_user(conversation, user, hide=True):
    now = timezone.now()
    updates = {
        'cleared_at': now,
        'is_archived': False,
    }
    if hide:
        updates['deleted_at'] = now
    else:
        updates['deleted_at'] = None
    ConversationMember.objects.filter(conversation=conversation, user=user).update(**updates)


def hide_conversation_for_user(conversation, user):
    clear_conversation_for_user(conversation, user, hide=True)


def member_user_ids(conversation):
    return list(conversation.members.values_list('user_id', flat=True))


def group_name(user_id):
    return f'user_{user_id}'


def broadcast_to_members(conversation, payload):
    """Synchronous fan-out (used from DRF views). The consumer awaits group_send directly.

    Deferred to transaction.on_commit so we never broadcast a row that a later
    rollback discards (and never do channel I/O mid-transaction). on_commit runs
    immediately when there's no open transaction, so behaviour is unchanged in
    autocommit paths."""
    layer = get_channel_layer()
    if not layer:
        return
    uids = member_user_ids(conversation)  # resolve now; the send runs post-commit

    def _send():
        for uid in uids:
            async_to_sync(layer.group_send)(group_name(uid), payload)

    transaction.on_commit(_send)


def broadcast_to_user_ids(user_ids, payload):
    """Fan-out to known user ids without reloading a conversation."""
    layer = get_channel_layer()
    if not layer:
        return
    uids = list(user_ids)

    def _send():
        for uid in uids:
            async_to_sync(layer.group_send)(group_name(uid), payload)

    transaction.on_commit(_send)


def notify_user(user_id, notification_payload):
    """Push a single in-app notification to a user's personal WS group so the
    bell updates instantly (no polling). Best-effort: silently no-ops if the
    channel layer is unavailable or the user has no live socket. Deferred to
    transaction.on_commit (see broadcast_to_members)."""
    layer = get_channel_layer()
    if not layer or not user_id:
        return

    def _send():
        async_to_sync(layer.group_send)(group_name(user_id), {
            'type': 'notification.new',
            'notification': notification_payload,
        })

    transaction.on_commit(_send)
