from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.inventory.models import Item
from .models import Conversation, ConversationMember, Message, can_message
from . import assistant, presence, services

User = get_user_model()
PAGE = 50
MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024  # 5 MB


def _validate_image(f):
    """Return an error string if the upload isn't a safe image, else None."""
    if f.size > MAX_ATTACHMENT_BYTES:
        return 'Image must be 5 MB or smaller.'
    try:
        from PIL import Image
        img = Image.open(f)
        img.verify()           # detect truncated/corrupt or non-image files
        f.seek(0)              # rewind for the actual save
    except Exception:
        return 'Invalid or unsupported image file.'
    return None


class ConversationViewSet(viewsets.ViewSet):
    """Direct-message conversations for the logged-in user.
    Live delivery is over WebSocket; these endpoints bootstrap + persist."""

    def _my_qs(self):
        return (
            Conversation.objects
            .filter(members__user=self.request.user, members__deleted_at__isnull=True)
            .prefetch_related(Prefetch('members', queryset=ConversationMember.objects.select_related('user')))
            .distinct()
        )

    def _get_member_conv(self, pk):
        """Return a conversation the user belongs to, or None."""
        return self._my_qs().filter(pk=pk).first()

    # ── GET /conversations/ ──
    def list(self, request):
        convs = self._my_qs()
        data = [services.serialize_conversation(c, request.user) for c in convs]
        # newest activity first
        data.sort(key=lambda c: c['updatedAt'], reverse=True)
        return Response(data)

    # ── POST /conversations/  { userId } → start or get a DM ──
    def create(self, request):
        target_id = request.data.get('userId')
        if not target_id:
            return Response({'detail': 'userId is required.'}, status=400)
        target = User.objects.filter(pk=target_id, is_active=True).first()
        if not target:
            return Response({'detail': 'User not found.'}, status=404)
        if not can_message(request.user, target):
            return Response({'detail': 'You are not allowed to message this user.'}, status=403)

        # Find an existing 2-party conversation between exactly these two.
        # NOTE: the two members__user filters create two joins, so a single
        # Count('members') annotation is inflated/unreliable — check each
        # candidate's real member count instead (keeps start-or-get idempotent).
        conv, created = services.get_or_create_direct_conversation(request.user, target)
        return Response(
            services.serialize_conversation(conv, request.user),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def retrieve(self, request, pk=None):
        conv = self._get_member_conv(pk)
        if not conv:
            return Response({'detail': 'Not found.'}, status=404)
        return Response(services.serialize_conversation(conv, request.user))

    # ── GET/POST /conversations/{id}/messages/ ──
    @action(detail=True, methods=['get', 'post'])
    def messages(self, request, pk=None):
        conv = self._get_member_conv(pk)
        if not conv:
            return Response({'detail': 'Not found.'}, status=404)

        if request.method == 'GET':
            member = ConversationMember.objects.filter(conversation=conv, user=request.user).first()
            qs = conv.messages.select_related('sender', 'item').prefetch_related('reactions')
            if member and member.cleared_at:
                qs = qs.filter(created_at__gt=member.cleared_at)
            before = request.query_params.get('before')
            if before:
                qs = qs.filter(id__lt=before)
            rows = list(qs.order_by('-created_at')[:PAGE])
            rows.reverse()  # ascending for display
            return Response({
                'results': [services.serialize_message(m) for m in rows],
                'hasMore': qs.filter(id__lt=(rows[0].id if rows else 0)).exists() if rows else False,
            })

        # POST — used for messages with an image attachment (text/item-only go over WS)
        body = strip_tags((request.data.get('body') or '')).strip()
        item_id = request.data.get('itemId')
        item = Item.objects.filter(pk=item_id).first() if item_id else None
        # Don't let a user reference an item they can't see in inventory
        # (access_level scoping) — otherwise they could leak hidden item details.
        if item and not request.user.has_min_role(item.access_level):
            item = None
        attachment = request.FILES.get('attachment')
        if attachment:
            err = _validate_image(attachment)
            if err:
                return Response({'detail': err}, status=400)
        if not body and not item and not attachment:
            return Response({'detail': 'Message cannot be empty.'}, status=400)

        msg = services.create_message(conv, request.user, body=body, item=item, attachment=attachment)
        # sender has read their own message
        ConversationMember.objects.filter(conversation=conv, user=request.user).update(last_read_at=timezone.now())
        services.broadcast_to_members(conv, {'type': 'chat.message', 'message': services.serialize_message(msg)})
        if body:
            auto_reply = assistant.create_offline_auto_reply(conv.id, request.user.id, body)
            if auto_reply:
                payload, _member_ids = auto_reply
                services.broadcast_to_members(conv, {'type': 'chat.message', 'message': payload})
        return Response(services.serialize_message(msg), status=status.HTTP_201_CREATED)

    # ── POST /conversations/{id}/react/  { messageId, emoji } — toggle a reaction ──
    @action(detail=True, methods=['post'])
    def react(self, request, pk=None):
        conv = self._get_member_conv(pk)
        if not conv:
            return Response({'detail': 'Not found.'}, status=404)
        msg = Message.objects.filter(pk=request.data.get('messageId'), conversation=conv).first()
        if not msg:
            return Response({'detail': 'Message not found.'}, status=404)
        emoji = (request.data.get('emoji') or '').strip()[:16]
        if not emoji:
            return Response({'detail': 'emoji is required.'}, status=400)
        reactions = services.toggle_reaction(msg, request.user, emoji)
        services.broadcast_to_members(conv, {'type': 'chat.reaction', 'conversationId': conv.id, 'messageId': msg.id, 'reactions': reactions})
        return Response({'messageId': msg.id, 'reactions': reactions})

    # ── POST /conversations/{id}/read/ ──
    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        conv = self._get_member_conv(pk)
        if not conv:
            return Response({'detail': 'Not found.'}, status=404)
        now = timezone.now()
        ConversationMember.objects.filter(conversation=conv, user=request.user).update(last_read_at=now)
        services.broadcast_to_members(conv, {
            'type': 'chat.read', 'conversationId': conv.id, 'userId': request.user.id, 'lastReadAt': now.isoformat(),
        })
        return Response({'status': 'ok', 'lastReadAt': now.isoformat()})

    # ── POST /conversations/{id}/archive/  { archived } ──
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        conv = self._get_member_conv(pk)
        if not conv:
            return Response({'detail': 'Not found.'}, status=404)
        archived = bool(request.data.get('archived', True))
        ConversationMember.objects.filter(conversation=conv, user=request.user).update(is_archived=archived)
        return Response({'status': 'ok', 'isArchived': archived})

    # ── GET /conversations/contacts/ — who I may start a conversation with ──
    @action(detail=True, methods=['post'])
    def delete(self, request, pk=None):
        conv = self._get_member_conv(pk)
        if not conv:
            return Response({'detail': 'Not found.'}, status=404)
        is_assistant_conv = conv.members.filter(user__username=assistant.ASSISTANT_USERNAME).exists()
        services.clear_conversation_for_user(conv, request.user, hide=not is_assistant_conv)
        return Response({'status': 'ok', 'isDeleted': not is_assistant_conv})

    @action(detail=False, methods=['get'])
    def contacts(self, request):
        qs = User.objects.filter(is_active=True).exclude(pk=request.user.id)
        if not request.user.is_staff_or_above:
            # students/faculty can only reach the support side
            qs = qs.filter(role__in=['STAFF', 'ADMIN'])
        qs = qs.order_by('role', 'first_name', 'username')
        data = []
        for user in qs:
            row = services.user_brief(user)
            row['online'] = presence.is_user_online(user.id)
            data.append(row)
        return Response(data)


class AssistantConversationView(APIView):
    """Return the current user's saved PLMun Assistant conversation."""

    def get(self, request):
        conv = assistant.get_or_create_assistant_conversation(request.user)
        return Response(services.serialize_conversation(conv, request.user))


class AssistantMessageView(APIView):
    """Persist a user question, call the configured LLM, then save the reply."""

    def post(self, request):
        # Optional referred item — resolved through the user's role-scoped
        # visibility so they can only ask about items they're allowed to see.
        item = None
        item_id = request.data.get('itemId')
        if item_id:
            item = assistant._role_scoped_items(request.user).filter(pk=item_id).first()
        try:
            user_msg, assistant_msg, error = assistant.save_assistant_exchange(
                request.user,
                request.data.get('body'),
                item=item,
            )
        except assistant.AssistantUnavailable as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'userMessage': services.serialize_message(user_msg),
            'assistantMessage': services.serialize_message(assistant_msg),
            'conversation': services.serialize_conversation(user_msg.conversation, request.user),
        }, status=status.HTTP_201_CREATED)
