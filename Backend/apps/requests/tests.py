from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.inventory.models import Item
from apps.requests.models import Notification, Request
from apps.requests.notifications import notify_many
from apps.requests.overdue import run_overdue_scan


class RequestXssTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(
            username='student',
            password='password',
            role='STUDENT',
        )
        self.staff = User.objects.create_user(
            username='staff',
            password='password',
            role='STAFF',
        )
        self.item = Item.objects.create(
            name='Laptop',
            category=Item.Category.ELECTRONICS,
            quantity=3,
            status=Item.Status.AVAILABLE,
            access_level='STUDENT',
        )

    def test_create_request_strips_html_from_snapshot_and_purpose(self):
        self.client.force_authenticate(self.student)

        response = self.client.post('/api/requests/', {
            'item': self.item.id,
            'itemName': '<img src=x onerror=alert(1)>Laptop',
            'quantity': 1,
            'purpose': '<script>alert(1)</script>Class presentation',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['itemName'], 'Laptop')
        self.assertEqual(response.data['purpose'], 'alert(1)Class presentation')
        self.assertNotIn('<', response.data['itemName'])
        self.assertNotIn('<', response.data['purpose'])

    def test_create_request_uses_server_item_name_snapshot(self):
        self.client.force_authenticate(self.student)

        response = self.client.post('/api/requests/', {
            'item': self.item.id,
            'itemName': '<img src=x onerror=alert(1)>Fake Laptop',
            'quantity': 1,
            'purpose': 'Class presentation',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['itemName'], self.item.name)
        self.assertNotEqual(response.data['itemName'], 'Fake Laptop')

    def test_student_cannot_request_restricted_item_by_id(self):
        admin_item = Item.objects.create(
            name='Admin Router',
            category=Item.Category.ELECTRONICS,
            quantity=1,
            status=Item.Status.AVAILABLE,
            access_level='ADMIN',
        )
        self.client.force_authenticate(self.student)

        response = self.client.post('/api/requests/', {
            'item': admin_item.id,
            'quantity': 1,
            'purpose': 'Class presentation',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('item', response.data)
        self.assertFalse(Request.objects.filter(item=admin_item).exists())

    def test_unavailable_item_cannot_be_requested(self):
        self.item.status = Item.Status.MAINTENANCE
        self.item.save(update_fields=['status'])
        self.client.force_authenticate(self.student)

        response = self.client.post('/api/requests/', {
            'item': self.item.id,
            'quantity': 1,
            'purpose': 'Class presentation',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('item', response.data)
        self.assertFalse(Request.objects.filter(item=self.item).exists())

    def test_rejection_reason_strips_html_before_notification(self):
        req = Request.objects.create(
            item=self.item,
            item_name=self.item.name,
            requested_by=self.student,
            quantity=1,
            purpose='Class presentation',
        )
        self.client.force_authenticate(self.staff)

        response = self.client.post(f'/api/requests/{req.id}/reject/', {
            'reason': '<svg onload=alert(1)>Not available',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        req.refresh_from_db()
        self.assertEqual(req.rejection_reason, 'Not available')
        self.assertNotIn('<', req.rejection_reason)

    def test_approved_request_cannot_be_approved_twice(self):
        req = Request.objects.create(
            item=self.item,
            item_name=self.item.name,
            requested_by=self.student,
            quantity=2,
            purpose='Class presentation',
        )
        self.client.force_authenticate(self.staff)

        first = self.client.post(f'/api/requests/{req.id}/approve/')
        second = self.client.post(f'/api/requests/{req.id}/approve/')

        self.item.refresh_from_db()
        req.refresh_from_db()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(req.status, Request.Status.APPROVED)
        self.assertEqual(self.item.quantity, 1)


class ReturnHandshakeTests(APITestCase):
    """Two-step return: borrower requests → staff confirms receipt. Guards
    against a single accidental press closing out an unreturned item."""

    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='borrower', password='password', role='STUDENT')
        self.staff = User.objects.create_user(username='staff2', password='password', role='STAFF')
        self.item = Item.objects.create(
            name='Projector', category=Item.Category.ELECTRONICS, quantity=1,
            status=Item.Status.IN_USE, access_level='STUDENT', is_returnable=True,
        )
        self.req = Request.objects.create(
            item=self.item, item_name=self.item.name, requested_by=self.student,
            quantity=1, purpose='Class', status='APPROVED',
        )

    def test_borrower_request_return_does_not_restore_stock(self):
        self.client.force_authenticate(self.student)
        resp = self.client.post(f'/api/requests/{self.req.id}/request_return/')
        self.req.refresh_from_db(); self.item.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.req.status, 'RETURN_PENDING')
        self.assertEqual(self.item.quantity, 1)            # stock NOT restored yet
        self.assertEqual(self.item.status, 'IN_USE')

    def test_confirm_requires_pending_so_a_mispress_closes_nothing(self):
        """A staff press to confirm does nothing unless the borrower started the
        return — the original 'mispress closes it' bug."""
        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{self.req.id}/confirm_return/')
        self.req.refresh_from_db()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.req.status, 'APPROVED')      # untouched

    def test_full_handshake_restores_stock_and_closes(self):
        self.client.force_authenticate(self.student)
        self.client.post(f'/api/requests/{self.req.id}/request_return/')
        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{self.req.id}/confirm_return/')
        self.req.refresh_from_db(); self.item.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.req.status, 'RETURNED')
        self.assertEqual(self.req.return_confirmed_by, self.staff)
        self.assertEqual(self.item.quantity, 2)            # stock restored on confirm
        self.assertEqual(self.item.status, 'AVAILABLE')

    def test_student_cannot_confirm_their_own_return(self):
        self.client.force_authenticate(self.student)
        self.client.post(f'/api/requests/{self.req.id}/request_return/')
        resp = self.client.post(f'/api/requests/{self.req.id}/confirm_return/')
        self.req.refresh_from_db()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(self.req.status, 'RETURN_PENDING')  # still awaiting staff

    def test_cancel_return_reverts_to_approved(self):
        self.client.force_authenticate(self.student)
        self.client.post(f'/api/requests/{self.req.id}/request_return/')
        resp = self.client.post(f'/api/requests/{self.req.id}/cancel_return/')
        self.req.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.req.status, 'APPROVED')
        self.assertIsNone(self.req.return_requested_at)


class OverdueNotificationTests(APITestCase):
    """Notification fixes: stale-on-return cleanup + no duplicate overdue spam."""

    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='borrower3', password='password', role='STUDENT')
        self.staff = User.objects.create_user(username='staff3', password='password', role='STAFF')
        self.item = Item.objects.create(
            name='Webcam', category=Item.Category.ELECTRONICS, quantity=1,
            status=Item.Status.IN_USE, access_level='STUDENT', is_returnable=True,
        )

    def _overdue_request(self, status='APPROVED'):
        return Request.objects.create(
            item=self.item, item_name=self.item.name, requested_by=self.student,
            quantity=1, purpose='x', status=status,
            expected_return=timezone.now() - timedelta(days=1),
        )

    def test_confirm_return_deletes_overdue_notifications(self):
        req = self._overdue_request(status='RETURN_PENDING')
        Notification.objects.create(recipient=self.student, request=req, type='OVERDUE', message='overdue!')

        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{req.id}/confirm_return/')

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Notification.objects.filter(request=req, type='OVERDUE').exists())

    def test_overdue_scan_does_not_duplicate_unread_alert(self):
        req = self._overdue_request()

        run_overdue_scan()
        run_overdue_scan()  # second run must not create a second unread alert

        self.assertEqual(
            Notification.objects.filter(recipient=self.student, request=req, type='OVERDUE').count(),
            1,
        )

    def test_check_overdue_management_command_runs(self):
        self._overdue_request()
        out = StringIO()
        call_command('check_overdue', stdout=out)
        self.assertIn('Overdue scan complete', out.getvalue())


class NotifyManyTests(TestCase):
    """Batched fan-out helper dedups the same way create_notif_if_new does."""

    def setUp(self):
        User = get_user_model()
        self.s1 = User.objects.create_user(username='m1', password='password', role='STAFF')
        self.s2 = User.objects.create_user(username='m2', password='password', role='ADMIN')
        self.student = User.objects.create_user(username='m3', password='password', role='STUDENT')
        self.item = Item.objects.create(name='X', category='ELECTRONICS', quantity=1, access_level='STUDENT')
        self.req = Request.objects.create(
            item=self.item, item_name='X', requested_by=self.student, quantity=1, purpose='x',
        )

    def test_notify_many_creates_then_dedups(self):
        created = notify_many([self.s1, self.s2], request_obj=self.req, notif_type='STATUS_CHANGE', message='hi')
        self.assertEqual(len(created), 2)
        # Both recipients now have an unread notif of this type+request → skipped.
        again = notify_many([self.s1, self.s2], request_obj=self.req, notif_type='STATUS_CHANGE', message='hi again')
        self.assertEqual(len(again), 0)
        self.assertEqual(Notification.objects.filter(request=self.req, type='STATUS_CHANGE').count(), 2)


class RequestEndpointLockdownTests(APITestCase):
    """Generic PUT/PATCH/DELETE must be disabled so users can't bypass the
    approve/return workflow or hard-delete (findings #1/#2/#4)."""

    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='lockstu', password='password', role='STUDENT')
        self.item = Item.objects.create(
            name='Laptop', category=Item.Category.ELECTRONICS, quantity=3,
            status=Item.Status.AVAILABLE, access_level='STUDENT',
        )
        self.req = Request.objects.create(
            item=self.item, item_name='Laptop', requested_by=self.student,
            quantity=1, purpose='x', status='PENDING',
        )

    def test_patch_request_is_disabled(self):
        self.client.force_authenticate(self.student)
        resp = self.client.patch(f'/api/requests/{self.req.id}/', {'status': 'APPROVED'}, format='json')
        self.assertEqual(resp.status_code, 405)
        self.req.refresh_from_db()
        self.assertEqual(self.req.status, 'PENDING')  # self-approval blocked

    def test_delete_request_is_disabled(self):
        self.client.force_authenticate(self.student)
        resp = self.client.delete(f'/api/requests/{self.req.id}/')
        self.assertEqual(resp.status_code, 405)
        self.assertTrue(Request.objects.filter(pk=self.req.id).exists())  # not hard-deleted


class NotificationApiTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(
            username='notify-user',
            password='password',
            role='STUDENT',
        )
        self.client.force_authenticate(self.user)

    def test_direct_notification_create_is_rejected(self):
        response = self.client.post('/api/requests/notifications/', {
            'type': 'STATUS_CHANGE',
            'message': 'Forged notification',
        }, format='json')

        self.assertEqual(response.status_code, 405)
        self.assertEqual(Notification.objects.count(), 0)

    def test_read_all_action_still_allows_post(self):
        Notification.objects.create(
            recipient=self.user,
            type='STATUS_CHANGE',
            message='Real system notification',
        )

        response = self.client.post('/api/requests/notifications/read_all/')

        self.assertEqual(response.status_code, 200)
        self.assertTrue(Notification.objects.get().is_read)
