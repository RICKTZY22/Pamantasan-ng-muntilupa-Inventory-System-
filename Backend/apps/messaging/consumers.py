from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.utils.html import strip_tags
import asyncio
import logging

from apps.inventory.models import Item
from .models import Conversation, ConversationMember, Message
from . import assistant, presence, services

logger = logging.getLogger(__name__)
PRESENCE_GROUP = 'presence'


def _log_task_exception(task):
    """Done-callback for fire-and-forget tasks so their exceptions are logged
    instead of surfacing unhandled on the event loop."""
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.error('background chat task failed', exc_info=exc)


class ChatConsumer(AsyncJsonWebsocketConsumer):
    """One socket per logged-in user. Subscribes to the user's personal group
    (`user_<id>`) so every conversation they're in delivers to this socket,
    plus a global presence group for online dots."""

    async def connect(self):
        self.user = self.scope.get('user')
        if not self.user or not self.user.is_authenticated:
            await self.close(code=4001)
            return
        self.group = services.group_name(self.user.id)
        presence.mark_online(self.user.id)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.channel_layer.group_add(PRESENCE_GROUP, self.channel_name)
        subprotocols = [
            item.decode() if isinstance(item, bytes) else str(item)
            for item in self.scope.get('subprotocols', [])
        ]
        await self.accept('plmun.jwt' if 'plmun.jwt' in subprotocols else None)
        await self.channel_layer.group_send(PRESENCE_GROUP, {'type': 'presence.event', 'userId': self.user.id, 'online': True})

    async def disconnect(self, code):
        if getattr(self, 'user', None) and self.user.is_authenticated:
            await self.channel_layer.group_discard(self.group, self.channel_name)
            await self.channel_layer.group_discard(PRESENCE_GROUP, self.channel_name)
            online = presence.mark_offline(self.user.id)
            await self.channel_layer.group_send(PRESENCE_GROUP, {'type': 'presence.event', 'userId': self.user.id, 'online': online})

    async def receive_json(self, content):
        # Guard the whole dispatch: a malformed client frame (bad type, missing
        # keys, etc.) must never crash the consumer and drop the user's socket.
        try:
            presence.touch(self.user.id)  # keep the online TTL fresh while active
            t = (content or {}).get('type')
            if t == 'message.send':
                await self._handle_send(content)
            elif t == 'message.read':
                await self._handle_read(content)
            elif t == 'typing':
                await self._handle_typing(content)
            elif t == 'reaction.toggle':
                await self._handle_reaction(content)
        except Exception:
            logger.exception('chat consumer error handling frame: %r', content)

    # ── DB helpers ──
    @database_sync_to_async
    def _load_conv(self, conv_id):
        return (
            Conversation.objects
            # Match REST visibility: a member who deleted the thread must not be
            # able to revive it by posting from a stale socket.
            .filter(pk=conv_id, members__user=self.user, members__deleted_at__isnull=True)
            .prefetch_related('members__user')
            .first()
        )

    @database_sync_to_async
    def _persist_message(self, conv, body, item_id):
        item = Item.objects.filter(pk=item_id).first() if item_id else None
        # Access_level scoping: don't reference items the sender can't see.
        if item and not self.user.has_min_role(item.access_level):
            item = None
        msg = services.create_message(conv, self.user, body=body, item=item)
        ConversationMember.objects.filter(conversation=conv, user=self.user).update(last_read_at=timezone.now())
        return services.serialize_message(msg)

    @database_sync_to_async
    def _member_ids(self, conv):
        return services.member_user_ids(conv)

    @database_sync_to_async
    def _mark_read(self, conv):
        now = timezone.now()
        ConversationMember.objects.filter(conversation=conv, user=self.user).update(last_read_at=now)
        return now.isoformat(), services.member_user_ids(conv)

    # ── inbound ──
    async def _handle_send(self, content):
        conv = await self._load_conv(content.get('conversationId'))
        if not conv:
            return
        body = strip_tags((content.get('body') or '')).strip()
        item_id = content.get('itemId')
        if not body and not item_id:
            return
        payload = await self._persist_message(conv, body, item_id)
        for uid in await self._member_ids(conv):
            await self.channel_layer.group_send(services.group_name(uid), {'type': 'chat.message', 'message': payload})
        task = asyncio.create_task(self._maybe_auto_reply(conv.id, body))
        task.add_done_callback(_log_task_exception)

    @database_sync_to_async
    def _create_auto_reply(self, conv_id, body):
        return assistant.create_offline_auto_reply(conv_id, self.user.id, body)

    async def _maybe_auto_reply(self, conv_id, body):
        result = await self._create_auto_reply(conv_id, body)
        if not result:
            return
        payload, member_ids = result
        for uid in member_ids:
            await self.channel_layer.group_send(services.group_name(uid), {'type': 'chat.message', 'message': payload})

    async def _handle_read(self, content):
        conv = await self._load_conv(content.get('conversationId'))
        if not conv:
            return
        iso, uids = await self._mark_read(conv)
        for uid in uids:
            await self.channel_layer.group_send(services.group_name(uid), {
                'type': 'chat.read', 'conversationId': conv.id, 'userId': self.user.id, 'lastReadAt': iso,
            })

    async def _handle_typing(self, content):
        conv = await self._load_conv(content.get('conversationId'))
        if not conv:
            return
        for uid in await self._member_ids(conv):
            if uid == self.user.id:
                continue
            await self.channel_layer.group_send(services.group_name(uid), {
                'type': 'chat.typing', 'conversationId': conv.id, 'userId': self.user.id, 'isTyping': bool(content.get('isTyping')),
            })

    @database_sync_to_async
    def _toggle_reaction(self, conv, message_id, emoji):
        msg = Message.objects.filter(pk=message_id, conversation=conv).first()
        if not msg:
            return None
        return services.toggle_reaction(msg, self.user, emoji), services.member_user_ids(conv)

    async def _handle_reaction(self, content):
        conv = await self._load_conv(content.get('conversationId'))
        if not conv:
            return
        emoji = (content.get('emoji') or '').strip()[:16]
        if not emoji:
            return
        res = await self._toggle_reaction(conv, content.get('messageId'), emoji)
        if not res:
            return
        reactions, uids = res
        for uid in uids:
            await self.channel_layer.group_send(services.group_name(uid), {
                'type': 'chat.reaction', 'conversationId': conv.id, 'messageId': content.get('messageId'), 'reactions': reactions,
            })

    # ── group event → client ──
    async def chat_message(self, event):
        await self.send_json({'type': 'message.new', 'message': event['message']})

    async def chat_read(self, event):
        await self.send_json({'type': 'message.read', 'conversationId': event['conversationId'], 'userId': event['userId'], 'lastReadAt': event['lastReadAt']})

    async def chat_typing(self, event):
        await self.send_json({'type': 'typing', 'conversationId': event['conversationId'], 'userId': event['userId'], 'isTyping': event['isTyping']})

    async def chat_reaction(self, event):
        await self.send_json({'type': 'reaction.update', 'conversationId': event['conversationId'], 'messageId': event['messageId'], 'reactions': event['reactions']})

    async def presence_event(self, event):
        await self.send_json({'type': 'presence', 'userId': event['userId'], 'online': event['online']})

    async def notification_new(self, event):
        await self.send_json({'type': 'notification.new', 'notification': event['notification']})
