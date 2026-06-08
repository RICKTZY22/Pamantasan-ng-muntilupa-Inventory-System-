from unittest.mock import patch
import time

from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from apps.messaging.consumers import ChatConsumer
from apps.messaging.middleware import _token_from_scope

from apps.inventory.models import Item
from apps.requests.models import Request
from apps.messaging import assistant
from apps.messaging import services
from apps.messaging.models import Conversation, ConversationMember, Message, dm_key_for_user_ids


User = get_user_model()


class ConsumerResilienceTests(TestCase):
    """A malformed client frame or a failing handler must not crash the consumer."""

    def test_token_can_come_from_websocket_subprotocol(self):
        scope = {'subprotocols': ['plmun.jwt', 'access-token-value'], 'query_string': b''}

        self.assertEqual(_token_from_scope(scope), 'access-token-value')

    def test_token_query_param_is_rejected(self):
        # Query-string tokens leak into logs; only the subprotocol is accepted.
        scope = {'subprotocols': [], 'query_string': b'token=legacy-token-value'}

        self.assertIsNone(_token_from_scope(scope))

    def test_receive_json_swallows_handler_exceptions(self):
        consumer = ChatConsumer()

        async def boom(content):
            raise ValueError('boom')

        consumer._handle_send = boom
        # The dispatch guard logs and continues — this must not raise.
        async_to_sync(consumer.receive_json)({'type': 'message.send', 'conversationId': 1})

    def test_unknown_or_empty_frames_are_ignored(self):
        consumer = ChatConsumer()
        async_to_sync(consumer.receive_json)({'type': 'totally.bogus'})
        async_to_sync(consumer.receive_json)(None)


class AssistantApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='student1',
            password='pass12345',
            first_name='Student',
            last_name='One',
            role='STUDENT',
        )
        self.client.force_authenticate(self.user)

    def test_assistant_conversation_is_created_once(self):
        first = self.client.get('/api/messaging/assistant/conversation/')
        second = self.client.get('/api/messaging/assistant/conversation/')

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertTrue(first.data['isAssistant'])
        self.assertEqual(Conversation.objects.count(), 1)

    def test_assistant_user_is_hidden_from_contacts(self):
        assistant.get_assistant_user()

        response = self.client.get('/api/messaging/conversations/contacts/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = [row['name'] for row in response.data]
        self.assertNotIn('PLMun Assistant', usernames)

    @override_settings(GEMINI_API_KEY='', ASSISTANT_PROVIDER='gemini')
    def test_missing_gemini_key_returns_clear_error_without_fake_answer(self):
        response = self.client.post('/api/messaging/assistant/messages/', {'body': 'What is low stock?'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn('Gemini is not configured', response.data['detail'])
        self.assertEqual(Message.objects.count(), 1)
        self.assertEqual(Message.objects.first().sender, self.user)

    @override_settings(ASSISTANT_PROVIDER='ollama', OLLAMA_MODEL='llama3.2')
    @patch('apps.messaging.assistant.requests.post')
    def test_ollama_provider_saves_assistant_reply(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'message': {'role': 'assistant', 'content': 'There are 3 available items.'}}

        response = self.client.post('/api/messaging/assistant/messages/', {'body': 'How many items?'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['assistantMessage']['body'], 'There are 3 available items.')
        self.assertTrue(response.data['assistantMessage']['sender']['isAssistant'])
        self.assertEqual(Message.objects.count(), 2)
        # No Gemini key needed for the local provider.
        self.assertEqual(mock_post.call_count, 1)

    @override_settings(ASSISTANT_PROVIDER='ollama')
    @patch('apps.messaging.assistant.requests.post', side_effect=__import__('requests').exceptions.ConnectionError())
    def test_ollama_unreachable_returns_clear_error(self, _mock_post):
        response = self.client.post('/api/messaging/assistant/messages/', {'body': 'How many items?'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn('Ollama is not reachable', response.data['detail'])
        # User message is still persisted; no fabricated assistant reply.
        self.assertEqual(Message.objects.count(), 1)

    @override_settings(ASSISTANT_PROVIDER='bad-provider')
    def test_unknown_assistant_provider_returns_clear_error(self):
        response = self.client.post('/api/messaging/assistant/messages/', {'body': 'How many items?'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn('Unknown assistant provider', response.data['detail'])
        self.assertEqual(Message.objects.count(), 1)

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('apps.messaging.assistant.generate_reply', return_value='There are no visible low-stock items.')
    def test_successful_send_saves_user_and_assistant_messages(self, _mock_generate):
        response = self.client.post('/api/messaging/assistant/messages/', {'body': 'Show low stock.'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['userMessage']['body'], 'Show low stock.')
        self.assertEqual(response.data['assistantMessage']['body'], 'There are no visible low-stock items.')
        self.assertTrue(response.data['assistantMessage']['sender']['isAssistant'])
        self.assertEqual(Message.objects.count(), 2)

    def test_delete_assistant_thread_clears_history_for_user(self):
        conv = assistant.get_or_create_assistant_conversation(self.user)
        bot = assistant.get_assistant_user()
        services.create_message(conv, self.user, body='Old question')
        services.create_message(conv, bot, body='Old answer')

        deleted = self.client.post(f'/api/messaging/conversations/{conv.id}/delete/')
        cleared_messages = self.client.get(f'/api/messaging/conversations/{conv.id}/messages/')
        reopened = self.client.get('/api/messaging/assistant/conversation/')

        self.assertEqual(deleted.status_code, status.HTTP_200_OK)
        self.assertFalse(deleted.data['isDeleted'])
        self.assertEqual(cleared_messages.status_code, status.HTTP_200_OK)
        self.assertEqual(cleared_messages.data['results'], [])
        self.assertEqual(reopened.status_code, status.HTTP_200_OK)
        self.assertEqual(reopened.data['id'], conv.id)
        self.assertEqual(reopened.data['lastMessage'], None)
        self.assertIsNone(ConversationMember.objects.get(conversation=conv, user=self.user).deleted_at)

    def test_student_context_is_scoped_to_allowed_items_and_own_requests(self):
        other = User.objects.create_user(username='other', password='pass12345', role='STUDENT')
        visible_item = Item.objects.create(name='Student Laptop', category='ELECTRONICS', quantity=2, access_level='STUDENT')
        Item.objects.create(name='Admin Router', category='ELECTRONICS', quantity=1, access_level='ADMIN')
        Request.objects.create(item=visible_item, item_name='Student Laptop', requested_by=self.user, quantity=1, purpose='Class')
        Request.objects.create(item=visible_item, item_name='Other Laptop', requested_by=other, quantity=1, purpose='Class')

        context = assistant.build_context(self.user, 'Laptop')

        self.assertIn('Student Laptop', context)
        self.assertNotIn('Admin Router', context)
        self.assertNotIn('Other Laptop', context)

    def test_build_context_includes_referred_item_brand(self):
        item = Item.objects.create(name='Projector', brand='Epson', category='ELECTRONICS', quantity=1, access_level='STUDENT')

        context = assistant.build_context(self.user, 'What brand is this?', referred_item=item)

        self.assertIn('Referred item:', context)
        self.assertIn('brand=Epson', context)

    def test_referred_item_is_last_and_authoritative(self):
        """Regression: a referred item must be the LAST context (right before the
        question) and bind "this" to itself, or recent conversation memory hijacks
        the question and the model answers about the wrong item."""
        item = Item.objects.create(name='Power Strip', brand='UGreen', category='ELECTRONICS', quantity=21, access_level='STUDENT')

        context = assistant.build_context(self.user, 'Is this available?', referred_item=item)

        self.assertIn('It EXISTS in the inventory', context)
        self.assertIn('they mean exactly this referred item', context)
        # Referred item must sit AFTER memory/lists but BEFORE the user question.
        self.assertGreater(context.index('Referred item:'), context.index('Recent conversation memory:'))
        self.assertLess(context.index('Referred item:'), context.index('User question:'))

    def test_context_includes_staff_admin_directory(self):
        User.objects.create_user(
            username='staffjoe', password='pass12345', first_name='Joe', last_name='Cruz',
            role='STAFF', department='Library', phone='09171234567',
        )

        context = assistant.build_context(self.user, 'Who are the staff and where are they?')

        self.assertIn('Support directory', context)
        self.assertIn('Joe Cruz', context)
        self.assertIn('department=Library', context)
        self.assertIn('09171234567', context)

    @override_settings(ASSISTANT_PROVIDER='ollama')
    @patch('apps.messaging.assistant.requests.post')
    def test_assistant_answers_about_a_referred_item(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'message': {'content': 'It is a Dell laptop.'}}
        item = Item.objects.create(name='Laptop', brand='Dell', category='ELECTRONICS', quantity=2, access_level='STUDENT')

        response = self.client.post(
            '/api/messaging/assistant/messages/',
            {'body': 'What brand is this?', 'itemId': item.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # The referred item is attached to the user's message...
        self.assertEqual(response.data['userMessage']['item']['brand'], 'Dell')
        # ...and its brand was injected into the prompt sent to the model.
        sent_prompt = mock_post.call_args.kwargs['json']['messages'][1]['content']
        self.assertIn('brand=Dell', sent_prompt)

    @override_settings(ASSISTANT_PROVIDER='ollama')
    @patch('apps.messaging.assistant.requests.post')
    def test_referred_item_outside_visibility_is_ignored(self, mock_post):
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {'message': {'content': 'No item recorded.'}}
        hidden = Item.objects.create(name='Admin Router', brand='Cisco', category='ELECTRONICS', quantity=1, access_level='ADMIN')

        response = self.client.post(
            '/api/messaging/assistant/messages/',
            {'body': 'What brand is this?', 'itemId': hidden.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # A STUDENT cannot refer an ADMIN-only item — no item is attached.
        self.assertIsNone(response.data['userMessage']['item'])

    def test_polish_reply_text_formats_inline_bullets(self):
        raw = (
            'You currently have 6 visible requests with the following statuses: '
            '* 2 APPROVED * 1 CANCELLED * 1 REJECTED * 2 RETURNED '
            'Your recent requests include: * Anker USB-C Hub x1 - APPROVED'
        )

        polished = assistant.polish_reply_text(raw)

        self.assertIn('\n- 2 APPROVED', polished)
        self.assertIn('\n- 1 CANCELLED', polished)
        self.assertIn('\n\nYour recent requests include:', polished)
        self.assertIn('\n- Anker USB-C Hub x1 - APPROVED', polished)
        self.assertNotIn('* 2 APPROVED', polished)


class AssistantStaffContextTests(APITestCase):
    def test_staff_context_can_include_broader_request_summary(self):
        staff = User.objects.create_user(username='staff1', password='pass12345', role='STAFF')
        student = User.objects.create_user(username='student2', password='pass12345', role='STUDENT')
        item = Item.objects.create(name='Projector', category='EQUIPMENT', quantity=1, access_level='STUDENT')
        Request.objects.create(item=item, item_name='Projector', requested_by=student, quantity=1, purpose='Event')

        context = assistant.build_context(staff, 'Projector')

        self.assertIn('Projector', context)
        self.assertIn('Visible request totals: total=1', context)


class ConversationLifecycleTests(APITestCase):
    def setUp(self):
        self.student = User.objects.create_user(username='student3', password='pass12345', role='STUDENT')
        self.staff = User.objects.create_user(username='staff2', password='pass12345', role='STAFF')
        self.client.force_authenticate(self.student)

    def test_start_conversation_uses_same_dm_key(self):
        first = self.client.post('/api/messaging/conversations/', {'userId': self.staff.id}, format='json')
        second = self.client.post('/api/messaging/conversations/', {'userId': self.staff.id}, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['id'], second.data['id'])
        conv = Conversation.objects.get(pk=first.data['id'])
        self.assertEqual(conv.dm_key, dm_key_for_user_ids(self.student.id, self.staff.id))

    def test_delete_hides_thread_for_current_user_and_restart_unhides(self):
        conv, _created = services.get_or_create_direct_conversation(self.student, self.staff)
        services.create_message(conv, self.staff, body='Old support message')

        deleted = self.client.post(f'/api/messaging/conversations/{conv.id}/delete/')
        listed = self.client.get('/api/messaging/conversations/')
        restarted = self.client.post('/api/messaging/conversations/', {'userId': self.staff.id}, format='json')
        messages = self.client.get(f'/api/messaging/conversations/{conv.id}/messages/')

        self.assertEqual(deleted.status_code, status.HTTP_200_OK)
        self.assertEqual(listed.data, [])
        self.assertEqual(restarted.data['id'], conv.id)
        self.assertEqual(restarted.data['lastMessage'], None)
        self.assertEqual(messages.data['results'], [])
        self.assertIsNone(ConversationMember.objects.get(conversation=conv, user=self.student).deleted_at)

    @patch('apps.messaging.views._create_and_broadcast_auto_reply')
    def test_rest_message_send_does_not_wait_for_auto_reply(self, mock_worker):
        def slow_worker(*_args, **_kwargs):
            time.sleep(0.5)

        mock_worker.side_effect = slow_worker
        conv, _created = services.get_or_create_direct_conversation(self.student, self.staff)

        started = time.perf_counter()
        response = self.client.post(
            f'/api/messaging/conversations/{conv.id}/messages/',
            {'body': 'Can anyone help?'},
            format='json',
        )
        elapsed = time.perf_counter() - started

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertLess(elapsed, 0.3)

    @override_settings(GEMINI_API_KEY='test-key')
    @patch('apps.messaging.assistant.generate_reply', return_value='Thank you. Staff will follow up when available.')
    def test_offline_auto_reply_posts_into_same_thread(self, _mock_generate):
        conv, _created = services.get_or_create_direct_conversation(self.student, self.staff)
        services.create_message(conv, self.student, body='Can anyone help me?')

        result = assistant.create_offline_auto_reply(conv.id, self.student.id, 'Can anyone help me?')

        self.assertIsNotNone(result)
        payload, member_ids = result
        self.assertIn(self.student.id, member_ids)
        self.assertIn(self.staff.id, member_ids)
        self.assertEqual(payload['conversationId'], conv.id)
        self.assertTrue(payload['body'].startswith(assistant.AUTO_REPLY_PREFIX))
