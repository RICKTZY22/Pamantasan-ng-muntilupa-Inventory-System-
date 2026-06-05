from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.inventory.models import Item
from apps.requests.models import Notification, Request
from apps.requests.notifications import create_notif_if_new, notify_many
from apps.requests.overdue import run_overdue_scan
from apps.requests.serializers import RequestSerializer


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

    def test_cancelled_request_cannot_be_cancelled_twice(self):
        req = Request.objects.create(
            item=self.item,
            item_name=self.item.name,
            requested_by=self.student,
            quantity=1,
            purpose='Class presentation',
        )
        self.client.force_authenticate(self.student)

        first = self.client.post(f'/api/requests/{req.id}/cancel/')
        second = self.client.post(f'/api/requests/{req.id}/cancel/')

        req.refresh_from_db()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(req.status, Request.Status.CANCELLED)


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

    def test_request_return_second_click_sees_locked_state(self):
        self.client.force_authenticate(self.student)
        first = self.client.post(f'/api/requests/{self.req.id}/request_return/')
        second = self.client.post(f'/api/requests/{self.req.id}/request_return/')
        self.req.refresh_from_db()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(self.req.status, 'RETURN_PENDING')

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

    def test_nonreturnable_complete_second_click_sees_locked_state(self):
        consumable = Item.objects.create(
            name='Bond Paper', category=Item.Category.SUPPLIES, quantity=0,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=False,
        )
        req = Request.objects.create(
            item=consumable, item_name=consumable.name, requested_by=self.student,
            quantity=1, purpose='Class', status='APPROVED',
        )
        self.client.force_authenticate(self.student)
        first = self.client.post(f'/api/requests/{req.id}/complete/')
        second = self.client.post(f'/api/requests/{req.id}/complete/')
        req.refresh_from_db()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(req.status, 'COMPLETED')


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

    def test_unread_overdue_notification_has_database_guard(self):
        req = self._overdue_request()
        Notification.objects.create(recipient=self.student, request=req, type='OVERDUE', message='overdue 1')

        with self.assertRaises(IntegrityError), transaction.atomic():
            Notification.objects.create(recipient=self.student, request=req, type='OVERDUE', message='overdue 2')

    def test_create_notif_if_new_swallows_duplicate_overdue_insert(self):
        req = self._overdue_request()
        create_notif_if_new(self.student, req, 'OVERDUE', 'overdue 1')
        duplicate = create_notif_if_new(self.student, req, 'OVERDUE', 'overdue 2')

        self.assertIsNone(duplicate)
        self.assertEqual(Notification.objects.filter(recipient=self.student, request=req, type='OVERDUE').count(), 1)

    def test_return_pending_request_serializes_as_overdue(self):
        req = self._overdue_request(status='RETURN_PENDING')

        data = RequestSerializer(req).data

        self.assertTrue(data['isOverdue'])

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

    def test_two_different_status_change_events_both_deliver(self):
        created = notify_many([self.s1, self.s2], request_obj=self.req, notif_type='STATUS_CHANGE', message='hi')
        self.assertEqual(len(created), 2)
        # STATUS_CHANGE is an event stream, not a reminder; a new message should
        # still deliver even while an older one is unread.
        again = notify_many([self.s1, self.s2], request_obj=self.req, notif_type='STATUS_CHANGE', message='hi again')
        self.assertEqual(len(again), 2)
        self.assertEqual(Notification.objects.filter(request=self.req, type='STATUS_CHANGE').count(), 4)

    def test_overdue_notify_many_still_dedups_unread_reminders(self):
        created = notify_many([self.s1, self.s2], request_obj=self.req, notif_type='OVERDUE', message='overdue')
        again = notify_many([self.s1, self.s2], request_obj=self.req, notif_type='OVERDUE', message='overdue again')

        self.assertEqual(len(created), 2)
        self.assertEqual(len(again), 0)
        self.assertEqual(Notification.objects.filter(request=self.req, type='OVERDUE').count(), 2)


class RequestListFilterTests(APITestCase):
    """The Requests list endpoint must paginate and support the status / overdue /
    mine filters and priority-first ordering the paged UI relies on."""

    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user(username='liststaff', password='password', role='STAFF')
        self.student = User.objects.create_user(username='liststudent', password='password', role='STUDENT')
        self.item = Item.objects.create(
            name='Camera', category=Item.Category.ELECTRONICS, quantity=5,
            status=Item.Status.AVAILABLE, access_level='STUDENT',
        )

    def _make(self, **kw):
        defaults = dict(
            item=self.item, item_name=self.item.name, requested_by=self.student,
            quantity=1, purpose='x', status='PENDING',
        )
        defaults.update(kw)
        return Request.objects.create(**defaults)

    def test_list_is_paginated(self):
        for _ in range(3):
            self._make()
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('results', resp.data)
        self.assertEqual(resp.data['count'], 3)

    def test_status_filter(self):
        self._make(status='PENDING')
        self._make(status='APPROVED')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/?status=APPROVED')
        self.assertEqual(resp.data['count'], 1)
        self.assertTrue(all(r['status'] == 'APPROVED' for r in resp.data['results']))

    def test_overdue_filter_uses_outstanding_and_due_date(self):
        self._make(status='APPROVED', expected_return=timezone.now() - timedelta(days=2))   # overdue
        self._make(status='APPROVED', expected_return=timezone.now() + timedelta(days=2))   # not yet due
        self._make(status='PENDING')                                                        # not outstanding
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/?overdue=true')
        self.assertEqual(resp.data['count'], 1)
        self.assertTrue(resp.data['results'][0]['isOverdue'])

    def test_mine_filter_limits_to_caller(self):
        self._make(requested_by=self.staff)
        self._make(requested_by=self.student)
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/?mine=true')
        self.assertEqual(resp.data['count'], 1)
        self.assertEqual(resp.data['results'][0]['requestedById'], self.staff.id)

    def test_priority_ordering_high_first(self):
        self._make(priority='LOW')
        self._make(priority='HIGH')
        self._make(priority='MEDIUM')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/')
        priorities = [r['priority'] for r in resp.data['results']]
        self.assertEqual(priorities, ['HIGH', 'MEDIUM', 'LOW'])


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


class StricterRequestTests(APITestCase):
    """A user cannot request an item that is in use or out of stock."""

    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='strict_stu', password='password', role='STUDENT')
        self.item = Item.objects.create(
            name='Tablet', category=Item.Category.ELECTRONICS, quantity=2,
            status=Item.Status.AVAILABLE, access_level='STUDENT',
        )
        self.client.force_authenticate(self.student)

    def _post(self, item, quantity):
        return self.client.post('/api/requests/', {
            'item': item.id, 'quantity': quantity, 'purpose': 'Class',
        }, format='json')

    def test_in_use_item_cannot_be_requested(self):
        self.item.status = Item.Status.IN_USE
        self.item.save(update_fields=['status'])
        resp = self._post(self.item, 1)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('item', resp.data)

    def test_request_exceeding_stock_is_rejected(self):
        resp = self._post(self.item, 3)   # only 2 in stock
        self.assertEqual(resp.status_code, 400)
        self.assertIn('quantity', resp.data)

    def test_zero_stock_available_item_cannot_be_requested(self):
        self.item.quantity = 0
        self.item.save(update_fields=['quantity'])
        resp = self._post(self.item, 1)   # 1 > 0 available
        self.assertEqual(resp.status_code, 400)
        self.assertIn('quantity', resp.data)


class ReportAggregationTests(APITestCase):
    """Backend aggregation for the Reports page: period-scoped request stats +
    approval rate, most-requested items, and overdue grouped by borrower."""

    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user(username='rep_staff', password='password', role='STAFF')
        self.s1 = User.objects.create_user(username='rep_s1', password='password', role='STUDENT',
                                           first_name='Ana', last_name='Cruz')
        self.s2 = User.objects.create_user(username='rep_s2', password='password', role='STUDENT',
                                           first_name='Ben', last_name='Reyes')
        self.item_a = Item.objects.create(name='Projector', category=Item.Category.ELECTRONICS,
                                          quantity=5, status=Item.Status.AVAILABLE, access_level='STUDENT')
        self.item_b = Item.objects.create(name='Camera', category=Item.Category.ELECTRONICS,
                                          quantity=5, status=Item.Status.AVAILABLE, access_level='STUDENT')

    def _make(self, created_at=None, **kw):
        defaults = dict(item=self.item_a, item_name=self.item_a.name, requested_by=self.s1,
                        quantity=1, purpose='x', status='PENDING')
        defaults.update(kw)
        req = Request.objects.create(**defaults)
        if created_at is not None:                          # created_at is auto_now_add; backdate after insert
            Request.objects.filter(pk=req.pk).update(created_at=created_at)
            req.refresh_from_db()
        return req

    def test_stats_range_scopes_total_but_overdue_is_current_state(self):
        now = timezone.now()
        self._make(status='PENDING')                                                    # this month
        self._make(status='APPROVED', created_at=now - timedelta(days=60),              # 2 months old + overdue
                   expected_return=now - timedelta(days=10))
        self.client.force_authenticate(self.staff)

        month = self.client.get('/api/requests/stats/?range=month')
        all_time = self.client.get('/api/requests/stats/?range=all')

        self.assertEqual(month.status_code, 200)
        self.assertEqual(month.data['total'], 1)            # 60-day-old request excluded by range
        self.assertEqual(all_time.data['total'], 2)
        self.assertEqual(month.data['overdue'], 1)          # overdue is NOT range-scoped
        self.assertEqual(month.data['range'], 'month')

    def test_stats_approval_rate_and_strict_approved(self):
        for st in ['APPROVED', 'COMPLETED', 'RETURNED', 'REJECTED', 'PENDING']:
            self._make(status=st)
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/stats/?range=all')
        self.assertEqual(resp.data['approvalRate'], 75)     # 3 approved-set / 4 decided
        self.assertEqual(resp.data['approved'], 1)          # 'approved' stays strict (APPROVED only)

    def test_popular_items_groups_by_item_and_sums_quantity(self):
        self._make(item=self.item_a, item_name='Projector', quantity=2)
        self._make(item=self.item_a, item_name='Projector', quantity=3)
        self._make(item=self.item_b, item_name='Camera', quantity=1)
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/popular_items/?range=all')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        self.assertEqual(resp.data[0]['name'], 'Projector')
        self.assertEqual(resp.data[0]['count'], 5)          # 2 + 3
        self.assertEqual(resp.data[1]['name'], 'Camera')

    def test_popular_items_groups_across_rename(self):
        self._make(item=self.item_a, item_name='Old Name', quantity=2)
        self._make(item=self.item_a, item_name='Older Name', quantity=1)
        self.item_a.name = 'Projector HD'
        self.item_a.save(update_fields=['name'])
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/popular_items/?range=all')
        self.assertEqual(len(resp.data), 1)                 # one group by item_id
        self.assertEqual(resp.data[0]['name'], 'Projector HD')   # current name, not snapshot
        self.assertEqual(resp.data[0]['count'], 3)

    def test_overdue_grouped_by_borrower(self):
        now = timezone.now()
        self._make(requested_by=self.s1, status='APPROVED', expected_return=now - timedelta(days=5))
        self._make(requested_by=self.s1, status='APPROVED', expected_return=now - timedelta(days=12))
        self._make(requested_by=self.s2, status='APPROVED', expected_return=now - timedelta(days=3))
        self._make(requested_by=self.s2, status='APPROVED', expected_return=now + timedelta(days=3))   # not due
        self._make(requested_by=self.s1, status='PENDING')                                             # not outstanding
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/overdue_grouped/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)
        self.assertEqual(resp.data[0]['borrowerName'], 'Ana Cruz')   # sorted by maxDaysOverdue desc
        self.assertEqual(resp.data[0]['count'], 2)
        self.assertEqual(resp.data[0]['maxDaysOverdue'], 12)
        self.assertEqual(resp.data[1]['borrowerName'], 'Ben Reyes')
        self.assertEqual(resp.data[1]['count'], 1)
        self.assertEqual(sum(g['count'] for g in resp.data), 3)

    def test_overdue_grouped_search_matches_borrower_and_item(self):
        now = timezone.now()
        self._make(requested_by=self.s1, item=self.item_a, item_name='Projector',
                   status='APPROVED', expected_return=now - timedelta(days=5))
        self._make(requested_by=self.s2, item=self.item_b, item_name='Camera',
                   status='APPROVED', expected_return=now - timedelta(days=5))
        self.client.force_authenticate(self.staff)
        by_borrower = self.client.get('/api/requests/overdue_grouped/?search=Ana')
        self.assertEqual(len(by_borrower.data), 1)
        self.assertEqual(by_borrower.data[0]['borrowerName'], 'Ana Cruz')
        by_item = self.client.get('/api/requests/overdue_grouped/?search=Camera')
        self.assertEqual(len(by_item.data), 1)
        self.assertEqual(by_item.data[0]['borrowerName'], 'Ben Reyes')
