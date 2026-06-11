from datetime import timedelta
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.db import IntegrityError, transaction
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.authentication.models import AuditLog
from apps.inventory.models import Item
from apps.requests import auto_decision as ad
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


class RequestBorrowerSummaryTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.staff = User.objects.create_user(
            username='staff-summary',
            email='staff.summary@plmun.edu.ph',
            password='password',
            role='STAFF',
        )
        self.student = User.objects.create_user(
            username='student-summary',
            email='student.summary@plmun.edu.ph',
            password='password',
            first_name='Ana',
            last_name='Cruz',
            role='STUDENT',
            department='CICS',
            student_id='23149842',
            credit_score=95,
            overdue_count=1,
            early_return_count=2,
        )
        self.other = User.objects.create_user(
            username='other-summary',
            email='other.summary@plmun.edu.ph',
            password='password',
            first_name='Ben',
            last_name='Reyes',
            role='STUDENT',
            student_id='23149843',
        )
        self.item = Item.objects.create(
            name='Borrower Panel Laptop',
            category=Item.Category.ELECTRONICS,
            quantity=3,
            status=Item.Status.AVAILABLE,
            access_level='STUDENT',
        )
        self.request = Request.objects.create(
            item=self.item,
            item_name=self.item.name,
            requested_by=self.student,
            quantity=1,
            purpose='Panel QA',
        )
        self.other_request = Request.objects.create(
            item=self.item,
            item_name=self.item.name,
            requested_by=self.other,
            quantity=1,
            purpose='Hidden from Ana',
        )

    @staticmethod
    def _results(response):
        return response.data.get('results', response.data)

    def test_staff_list_includes_borrower_summary(self):
        self.client.force_authenticate(self.staff)

        response = self.client.get('/api/requests/')

        self.assertEqual(response.status_code, 200)
        row = next(item for item in self._results(response) if item['id'] == self.request.id)
        self.assertEqual(row['borrower']['fullName'], 'Ana Cruz')
        self.assertEqual(row['borrower']['email'], 'student.summary@plmun.edu.ph')
        self.assertEqual(row['borrower']['studentId'], '23149842')
        self.assertEqual(row['borrower']['department'], 'CICS')
        self.assertEqual(row['borrower']['creditScore'], 95)
        self.assertEqual(row['borrower']['overdueCount'], 1)
        self.assertEqual(row['borrower']['earlyReturnCount'], 2)

    def test_student_list_only_exposes_own_borrower_summary(self):
        self.client.force_authenticate(self.student)

        response = self.client.get('/api/requests/')

        self.assertEqual(response.status_code, 200)
        rows = self._results(response)
        self.assertEqual([row['id'] for row in rows], [self.request.id])
        self.assertEqual(rows[0]['borrower']['email'], 'student.summary@plmun.edu.ph')
        self.assertNotEqual(rows[0]['borrower']['email'], 'other.summary@plmun.edu.ph')

    def test_non_staff_serializer_does_not_expose_other_borrower(self):
        factory_request = type('RequestContext', (), {'user': self.student})()

        data = RequestSerializer(self.other_request, context={'request': factory_request}).data

        self.assertIsNone(data['borrower'])

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

    def test_admin_request_return_does_not_notify_self(self):
        admin = get_user_model().objects.create_user(
            username='admin_returner',
            password='password',
            role='ADMIN',
            first_name='Demo',
            last_name='Admin',
        )
        req = Request.objects.create(
            item=self.item, item_name=self.item.name, requested_by=admin,
            quantity=1, purpose='Admin borrow', status='APPROVED',
        )

        self.client.force_authenticate(admin)
        resp = self.client.post(f'/api/requests/{req.id}/request_return/')

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Notification.objects.filter(recipient=admin, request=req).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.staff, request=req).exists())

    def test_completed_returnable_request_cannot_be_returned_again(self):
        self.req.status = 'COMPLETED'
        self.req.returned_at = timezone.now()
        self.req.return_confirmed_by = self.staff
        self.req.save(update_fields=['status', 'returned_at', 'return_confirmed_by'])

        self.client.force_authenticate(self.student)
        resp = self.client.post(f'/api/requests/{self.req.id}/request_return/')

        self.req.refresh_from_db(); self.item.refresh_from_db()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.req.status, 'COMPLETED')
        self.assertEqual(self.item.quantity, 1)

    def test_completed_filter_includes_legacy_returned_rows(self):
        legacy = Request.objects.create(
            item=self.item, item_name=self.item.name, requested_by=self.student,
            quantity=1, purpose='Legacy', status='RETURNED',
            returned_at=timezone.now(), return_confirmed_by=self.staff,
        )
        self.client.force_authenticate(self.staff)

        resp = self.client.get('/api/requests/?completed=true')

        self.assertEqual(resp.status_code, 200)
        ids = {row['id'] for row in resp.data['results']}
        self.assertIn(legacy.id, ids)

    def test_nonreturnable_complete_second_click_sees_locked_state(self):
        consumable = Item.objects.create(
            name='Bond Paper', category=Item.Category.SUPPLIES, quantity=0,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=False,
        )
        req = Request.objects.create(
            item=consumable, item_name=consumable.name, requested_by=self.student,
            quantity=1, purpose='Class', status='APPROVED',
        )
        self.client.force_authenticate(self.staff)
        first = self.client.post(f'/api/requests/{req.id}/complete/')
        second = self.client.post(f'/api/requests/{req.id}/complete/')
        req.refresh_from_db()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(req.status, 'COMPLETED')

    def test_student_cannot_complete_their_own_nonreturnable_request(self):
        consumable = Item.objects.create(
            name='Marker', category=Item.Category.SUPPLIES, quantity=4,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=False,
        )
        req = Request.objects.create(
            item=consumable, item_name=consumable.name, requested_by=self.student,
            quantity=1, purpose='Class', status='APPROVED',
        )
        self.client.force_authenticate(self.student)

        resp = self.client.post(f'/api/requests/{req.id}/complete/')

        req.refresh_from_db()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(req.status, 'APPROVED')

    def test_returnable_request_cannot_be_completed_directly(self):
        self.client.force_authenticate(self.staff)

        resp = self.client.post(f'/api/requests/{self.req.id}/complete/')

        self.req.refresh_from_db()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(self.req.status, 'APPROVED')

    def test_confirmed_early_return_adds_credit_points(self):
        self.student.credit_score = 90
        self.student.save(update_fields=['credit_score'])
        self.req.expected_return = timezone.now() + timedelta(days=2)
        self.req.save(update_fields=['expected_return'])

        self.client.force_authenticate(self.student)
        self.client.post(f'/api/requests/{self.req.id}/request_return/')
        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{self.req.id}/confirm_return/')

        self.student.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.student.credit_score, 92)
        self.assertEqual(self.student.early_return_count, 1)

    def test_confirmed_late_return_deducts_credit_and_can_disable_account(self):
        # 79 - 5 = 74: strictly below the 75 threshold, so the account disables.
        self.student.credit_score = 79
        self.student.save(update_fields=['credit_score'])
        self.req.expected_return = timezone.now() - timedelta(days=2)
        self.req.save(update_fields=['expected_return'])

        self.client.force_authenticate(self.student)
        self.client.post(f'/api/requests/{self.req.id}/request_return/')
        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{self.req.id}/confirm_return/')

        self.student.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.student.credit_score, 74)
        self.assertEqual(self.student.overdue_count, 1)
        self.assertFalse(self.student.is_active)


class RequestApprovalLifecycleTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='life_stu', password='password', role='STUDENT')
        self.staff = User.objects.create_user(username='life_staff', password='password', role='STAFF')
        self.returnable = Item.objects.create(
            name='Laptop', category=Item.Category.ELECTRONICS, quantity=3,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=True,
        )
        self.nonreturnable = Item.objects.create(
            name='Bond Paper', category=Item.Category.SUPPLIES, quantity=10,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=False,
        )

    def _pending(self, item, qty=1):
        return Request.objects.create(
            item=item, item_name=item.name, requested_by=self.student,
            quantity=qty, purpose='Class', status='PENDING',
        )

    def test_returnable_approval_stays_approved_and_reserves_stock(self):
        req = self._pending(self.returnable, qty=1)
        self.client.force_authenticate(self.staff)

        resp = self.client.post(f'/api/requests/{req.id}/approve/')

        req.refresh_from_db()
        self.returnable.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(req.status, 'APPROVED')
        self.assertEqual(resp.data['status'], 'APPROVED')
        self.assertEqual(self.returnable.quantity, 2)

    def test_nonreturnable_approval_stays_approved_and_reserves_stock(self):
        req = self._pending(self.nonreturnable, qty=3)
        self.client.force_authenticate(self.staff)

        resp = self.client.post(f'/api/requests/{req.id}/approve/')

        req.refresh_from_db()
        self.nonreturnable.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(req.status, 'APPROVED')
        self.assertEqual(resp.data['status'], 'APPROVED')
        self.assertEqual(self.nonreturnable.quantity, 7)

    def test_staff_can_complete_approved_nonreturnable_without_restoring_stock(self):
        req = self._pending(self.nonreturnable, qty=2)
        self.client.force_authenticate(self.staff)
        self.client.post(f'/api/requests/{req.id}/approve/')
        self.nonreturnable.refresh_from_db()
        reserved_stock = self.nonreturnable.quantity

        resp = self.client.post(f'/api/requests/{req.id}/complete/')

        req.refresh_from_db()
        self.nonreturnable.refresh_from_db()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(req.status, 'COMPLETED')
        self.assertEqual(self.nonreturnable.quantity, reserved_stock)


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

    def test_student_can_trigger_overdue_scan_and_credit_penalty(self):
        req = self._overdue_request()
        self.client.force_authenticate(self.student)

        resp = self.client.post('/api/requests/check_overdue/')

        self.assertEqual(resp.status_code, 200)
        self.student.refresh_from_db()
        self.assertTrue(self.student.is_flagged)
        self.assertEqual(self.student.overdue_count, 1)
        self.assertEqual(self.student.credit_score, 95)
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.student,
                request=req,
                type='OVERDUE',
            ).exists()
        )

    def test_confirm_return_deletes_overdue_notifications(self):
        req = self._overdue_request(status='RETURN_PENDING')
        Notification.objects.create(recipient=self.student, request=req, type='OVERDUE', message='overdue!')

        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{req.id}/confirm_return/')

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(Notification.objects.filter(request=req, type='OVERDUE').exists())

    def test_completed_return_is_not_overdue(self):
        req = self._overdue_request(status='RETURN_PENDING')

        self.client.force_authenticate(self.staff)
        self.client.post(f'/api/requests/{req.id}/confirm_return/')

        req.refresh_from_db()
        self.assertEqual(req.status, 'RETURNED')
        self.assertFalse(RequestSerializer(req).data['isOverdue'])
        self.assertEqual(run_overdue_scan()['overdue_total'], 0)

    def test_overdue_scan_does_not_duplicate_unread_alert(self):
        req = self._overdue_request()

        run_overdue_scan()
        run_overdue_scan()  # second run must not create a second unread alert

        self.assertEqual(
            Notification.objects.filter(recipient=self.student, request=req, type='OVERDUE').count(),
            1,
        )

    def test_overdue_scan_deducts_credit_once_per_incident(self):
        req = self._overdue_request()

        run_overdue_scan()
        self.student.refresh_from_db()
        first_score = self.student.credit_score
        first_count = self.student.overdue_count
        run_overdue_scan()
        self.student.refresh_from_db()

        self.assertEqual(first_score, 95)
        self.assertEqual(first_count, 1)
        self.assertEqual(self.student.credit_score, 95)
        self.assertEqual(self.student.overdue_count, 1)
        self.assertEqual(
            Notification.objects.filter(recipient=self.student, request=req, type='OVERDUE').count(),
            1,
        )

    def test_overdue_penalty_survives_notification_deletion(self):
        # P0: the penalty ledger must be a persistent Request field, not the
        # (deletable) OVERDUE notification — else deleting it lets a rescan
        # charge the same incident again.
        req = self._overdue_request()
        run_overdue_scan()
        self.student.refresh_from_db()
        self.assertEqual(self.student.credit_score, 95)
        self.assertEqual(self.student.overdue_count, 1)

        Notification.objects.filter(request=req, type='OVERDUE').delete()  # borrower clears it
        run_overdue_scan()
        self.student.refresh_from_db()
        req.refresh_from_db()

        self.assertEqual(self.student.credit_score, 95)   # NOT 90
        self.assertEqual(self.student.overdue_count, 1)
        self.assertTrue(req.overdue_penalty_applied)

    def test_overdue_scan_then_confirm_return_charges_once(self):
        # P0: scan charges the penalty; confirming a late return must NOT charge
        # again (keyed on the persistent ledger, not the deletable notification).
        req = self._overdue_request()
        run_overdue_scan()
        self.student.refresh_from_db()
        self.assertEqual(self.student.credit_score, 95)

        req.status = 'RETURN_PENDING'
        req.save(update_fields=['status'])
        Notification.objects.filter(request=req, type='OVERDUE').delete()  # cleared before return
        self.client.force_authenticate(self.staff)
        resp = self.client.post(f'/api/requests/{req.id}/confirm_return/')

        self.assertEqual(resp.status_code, 200)
        self.student.refresh_from_db()
        self.assertEqual(self.student.credit_score, 95)   # NOT 90
        self.assertEqual(self.student.overdue_count, 1)

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


class ExpectedReturnOwnershipTests(APITestCase):
    """expectedReturn is server/staff-owned; a borrower cannot set it on create."""

    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='er_stu', password='password', role='STUDENT')
        self.item = Item.objects.create(
            name='Markers', category=Item.Category.SUPPLIES, quantity=5,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=False,
        )

    def test_expected_return_ignored_on_create(self):
        self.client.force_authenticate(self.student)
        resp = self.client.post('/api/requests/', {
            'item': self.item.id, 'quantity': 1, 'purpose': 'Class',
            'expectedReturn': '2099-12-31T23:59:59Z',
        }, format='json')
        self.assertEqual(resp.status_code, 201)
        req = Request.objects.get(id=resp.data['id'])
        self.assertIsNone(req.expected_return)   # borrower-supplied value ignored


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
        self.student = User.objects.create_user(
            username='liststudent',
            password='password',
            role='STUDENT',
            first_name='Mikaela',
            last_name='Castro',
            email='mikaela.castro.23149842@plmun.edu.ph',
            student_id='23149842',
        )
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

    def test_priority_filter(self):
        self._make(priority='HIGH')
        self._make(priority='LOW')
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/requests/?priority=HIGH')
        self.assertEqual(resp.data['count'], 1)
        self.assertTrue(all(r['priority'] == 'HIGH' for r in resp.data['results']))

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

    def test_staff_search_matches_borrower_identity_fields(self):
        req = self._make(status='APPROVED')
        self.client.force_authenticate(self.staff)

        searches = ['Mikaela', 'Castro', 'Mikaela Castro', 'liststudent', '23149842', 'mikaela.castro']
        for term in searches:
            with self.subTest(term=term):
                resp = self.client.get('/api/requests/', {'search': term})
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.data['count'], 1)
                self.assertEqual(resp.data['results'][0]['id'], req.id)

    def test_staff_search_does_not_match_item_name_or_purpose(self):
        self._make(item_name='Camera', purpose='Capstone demo')
        self.client.force_authenticate(self.staff)

        by_item = self.client.get('/api/requests/', {'search': 'Camera'})
        by_purpose = self.client.get('/api/requests/', {'search': 'Capstone'})

        self.assertEqual(by_item.status_code, 200)
        self.assertEqual(by_item.data['count'], 0)
        self.assertEqual(by_purpose.data['count'], 0)

    def test_student_search_still_matches_their_own_item_and_purpose(self):
        req = self._make(item_name='Camera', purpose='Capstone demo')
        self.client.force_authenticate(self.student)

        by_item = self.client.get('/api/requests/', {'search': 'Camera'})
        by_purpose = self.client.get('/api/requests/', {'search': 'Capstone'})

        self.assertEqual(by_item.status_code, 200)
        self.assertEqual(by_item.data['count'], 1)
        self.assertEqual(by_item.data['results'][0]['id'], req.id)
        self.assertEqual(by_purpose.data['count'], 1)
        self.assertEqual(by_purpose.data['results'][0]['id'], req.id)


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

    def test_delete_removes_single_notification(self):
        notification = Notification.objects.create(
            recipient=self.user,
            type='STATUS_CHANGE',
            message='Delete me',
        )

        response = self.client.delete(f'/api/requests/notifications/{notification.id}/')

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Notification.objects.filter(pk=notification.id).exists())

    def test_clear_all_deletes_only_current_users_notifications(self):
        User = get_user_model()
        other = User.objects.create_user(
            username='notify-other',
            password='password',
            role='STUDENT',
        )
        mine = Notification.objects.create(
            recipient=self.user,
            type='STATUS_CHANGE',
            message='Mine',
        )
        theirs = Notification.objects.create(
            recipient=other,
            type='STATUS_CHANGE',
            message='Theirs',
        )

        response = self.client.delete('/api/requests/notifications/clear_all/')

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Notification.objects.filter(pk=mine.id).exists())
        self.assertTrue(Notification.objects.filter(pk=theirs.id).exists())


class RequestClearNotificationCleanupTests(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.student = User.objects.create_user(username='clear-stu', password='password', role='STUDENT')
        self.staff = User.objects.create_user(username='clear-staff', password='password', role='STAFF')
        self.admin = User.objects.create_user(username='clear-admin', password='password', role='ADMIN')
        self.item = Item.objects.create(
            name='Clear Camera',
            category=Item.Category.ELECTRONICS,
            quantity=2,
            status=Item.Status.AVAILABLE,
            access_level='STUDENT',
        )

    def _request(self, status='COMPLETED'):
        return Request.objects.create(
            item=self.item,
            item_name=self.item.name,
            requested_by=self.student,
            quantity=1,
            purpose='cleanup',
            status=status,
        )

    def test_clear_completed_also_deletes_linked_notifications(self):
        req = self._request(status='COMPLETED')
        linked = Notification.objects.create(
            recipient=self.student,
            request=req,
            type='STATUS_CHANGE',
            message='Completed',
        )
        unrelated = Notification.objects.create(
            recipient=self.student,
            type='STATUS_CHANGE',
            message='No request link',
        )
        self.client.force_authenticate(self.staff)

        response = self.client.delete('/api/requests/clear_completed/')

        req.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertTrue(req.is_cleared)
        self.assertEqual(response.data['notificationsCleared'], 1)
        self.assertFalse(Notification.objects.filter(pk=linked.id).exists())
        self.assertTrue(Notification.objects.filter(pk=unrelated.id).exists())

    def test_clear_history_deletes_linked_notifications_before_history_delete(self):
        from django.core.cache import cache
        cache.set('history_clear_code', '1234', timeout=None)
        req = self._request(status='COMPLETED')
        linked = Notification.objects.create(
            recipient=self.student,
            request=req,
            type='STATUS_CHANGE',
            message='Completed',
        )
        self.client.force_authenticate(self.admin)

        response = self.client.post('/api/requests/clear_history/', {'code': '1234'}, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['notificationsCleared'], 1)
        self.assertFalse(Request.objects.filter(pk=req.id).exists())
        self.assertFalse(Notification.objects.filter(pk=linked.id).exists())


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


class AutoDecisionRuleTests(TestCase):
    """Pure rule-engine tests (no DB / HTTP). Decisions are deterministic."""

    def setUp(self):
        self.config = dict(ad.DEFAULTS, mode='auto')  # enabled, default thresholds

    def _eval(self, **kw):
        base = dict(is_returnable=False, priority='LOW', quantity=1,
                    active_borrows=0, daily_count=0, config=self.config,
                    credit_score=100, overdue_count=0, stock=10)
        base.update(kw)
        return ad.evaluate(**base)

    def test_consumable_within_cap_auto_approves(self):
        self.assertEqual(self._eval(is_returnable=False, quantity=3).action, ad.AUTO_APPROVE)

    def test_low_priority_returnable_auto_approves(self):
        self.assertEqual(self._eval(is_returnable=True, priority='MEDIUM', quantity=2).action, ad.AUTO_APPROVE)

    def test_high_priority_returnable_needs_review(self):
        self.assertEqual(self._eval(is_returnable=True, priority='HIGH', quantity=1).action, ad.NEEDS_REVIEW)

    def test_over_active_borrow_limit_rejects(self):
        self.assertEqual(self._eval(active_borrows=5).action, ad.AUTO_REJECT)   # default limit 5

    def test_qty_over_hard_cap_rejects(self):
        self.assertEqual(self._eval(quantity=21).action, ad.AUTO_REJECT)        # default hard cap 20

    def test_qty_above_auto_cap_under_hard_cap_needs_review(self):
        self.assertEqual(self._eval(is_returnable=False, quantity=10).action, ad.NEEDS_REVIEW)

    def test_daily_cap_reached_needs_review(self):
        self.assertEqual(self._eval(daily_count=50).action, ad.NEEDS_REVIEW)    # default cap 50

    def test_credit_below_perfect_needs_staff_review(self):
        decision = self._eval(credit_score=95, overdue_count=1)
        self.assertEqual(decision.action, ad.NEEDS_REVIEW)
        self.assertIn('credit score', decision.reasons[0])

    def test_disabled_credit_score_auto_rejects(self):
        decision = self._eval(credit_score=74)
        self.assertEqual(decision.action, ad.AUTO_REJECT)

    def test_credit_at_threshold_goes_to_review_not_reject(self):
        decision = self._eval(credit_score=75)
        self.assertEqual(decision.action, ad.NEEDS_REVIEW)

    def test_stock_shortage_auto_rejects_before_approval(self):
        decision = self._eval(quantity=4, stock=3)
        self.assertEqual(decision.action, ad.AUTO_REJECT)


class AutoDecisionCreateTests(APITestCase):
    """create() integration: the auto path reuses the approval/rejection helpers.
    explain_decision is patched so tests never hit an LLM provider."""

    def setUp(self):
        User = get_user_model()
        cache.clear()
        self.student = User.objects.create_user(username='ad_stu', password='password', role='STUDENT')
        self.admin = User.objects.create_user(username='ad_admin', password='password', role='ADMIN')
        self.consumable = Item.objects.create(
            name='Bond Paper', category=Item.Category.SUPPLIES, quantity=10,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=False, priority='LOW',
        )
        self.high_returnable = Item.objects.create(
            name='DSLR Camera', category=Item.Category.ELECTRONICS, quantity=2,
            status=Item.Status.AVAILABLE, access_level='STUDENT', is_returnable=True, priority='HIGH',
        )

    def tearDown(self):
        cache.clear()

    def _submit(self, item, qty=1):
        self.client.force_authenticate(self.student)
        return self.client.post('/api/requests/', {
            'item': item.id, 'quantity': qty, 'purpose': 'Class',
        }, format='json')

    @patch('apps.messaging.assistant.explain_decision', return_value='Rule explanation.')
    def test_auto_mode_approves_consumable_and_decrements_stock(self, _mock):
        ad.set_config({'mode': 'auto'})
        resp = self._submit(self.consumable, qty=3)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'APPROVED')
        self.assertTrue(resp.data['autoDecided'])
        self.assertEqual(resp.data['autoRecommendation'], 'APPROVE')
        self.consumable.refresh_from_db()
        self.assertEqual(self.consumable.quantity, 7)        # 10 - 3 via reused helper
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.REQUEST_AUTO_APPROVED).exists())

    @patch('apps.messaging.assistant.explain_decision', return_value='Rule explanation.')
    def test_auto_mode_score_below_100_goes_to_staff_review(self, _mock):
        ad.set_config({'mode': 'auto'})
        self.student.credit_score = 95
        self.student.overdue_count = 1
        self.student.save(update_fields=['credit_score', 'overdue_count'])

        resp = self._submit(self.consumable, qty=3)

        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'PENDING')
        self.assertFalse(resp.data['autoDecided'])
        self.assertEqual(resp.data['autoRecommendation'], 'REVIEW')
        self.assertIn('credit score', resp.data['autoNote'])
        self.consumable.refresh_from_db()
        self.assertEqual(self.consumable.quantity, 10)

    def test_credit_score_below_threshold_blocks_new_requests_and_disables_account(self):
        self.student.credit_score = 74
        self.student.save(update_fields=['credit_score'])

        resp = self._submit(self.consumable, qty=1)

        self.student.refresh_from_db()
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(resp.data['code'], 'CREDIT_SCORE_DISABLED')
        self.assertFalse(self.student.is_active)

    def test_credit_score_at_threshold_can_still_submit(self):
        # Exactly 75 keeps access — only BELOW the threshold disables.
        self.student.credit_score = 75
        self.student.save(update_fields=['credit_score'])

        resp = self._submit(self.consumable, qty=1)

        self.student.refresh_from_db()
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(self.student.is_active)

    @patch('apps.messaging.assistant.explain_decision', return_value='Rule explanation.')
    def test_auto_mode_high_priority_returnable_stays_pending(self, _mock):
        ad.set_config({'mode': 'auto'})
        resp = self._submit(self.high_returnable, qty=1)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'PENDING')
        self.assertFalse(resp.data['autoDecided'])
        self.assertEqual(resp.data['autoRecommendation'], 'REVIEW')
        self.high_returnable.refresh_from_db()
        self.assertEqual(self.high_returnable.quantity, 2)   # unchanged

    @patch('apps.messaging.assistant.explain_decision', return_value='Rule explanation.')
    def test_auto_mode_rejects_over_active_limit(self, _mock):
        ad.set_config({'mode': 'auto', 'max_active_borrows': 1})
        Request.objects.create(
            item=self.high_returnable, item_name=self.high_returnable.name,
            requested_by=self.student, quantity=1, purpose='x', status='APPROVED',
        )
        resp = self._submit(self.consumable, qty=1)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'REJECTED')
        self.assertTrue(resp.data['autoDecided'])
        self.assertEqual(resp.data['autoRecommendation'], 'REJECT')
        self.assertTrue(AuditLog.objects.filter(action=AuditLog.REQUEST_AUTO_REJECTED).exists())

    def test_off_mode_leaves_request_pending(self):
        resp = self._submit(self.consumable, qty=3)             # cache cleared → mode off
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'PENDING')
        self.assertFalse(resp.data['autoDecided'])
        self.assertEqual(resp.data['autoRecommendation'], '')
        self.consumable.refresh_from_db()
        self.assertEqual(self.consumable.quantity, 10)          # unchanged

    @patch('apps.messaging.assistant.explain_decision', return_value='Rule explanation.')
    def test_suggest_mode_records_recommendation_without_executing(self, _mock):
        ad.set_config({'mode': 'suggest'})
        resp = self._submit(self.consumable, qty=3)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data['status'], 'PENDING')        # not executed
        self.assertFalse(resp.data['autoDecided'])
        self.assertEqual(resp.data['autoRecommendation'], 'APPROVE')
        self.assertIn('Auto-approved', resp.data['autoNote'])   # deterministic note
        self.consumable.refresh_from_db()
        self.assertEqual(self.consumable.quantity, 10)          # unchanged

    def test_ai_down_falls_back_to_templated_note(self):
        from apps.messaging.assistant import AssistantUnavailable
        ad.set_config({'mode': 'auto'})
        with patch('apps.messaging.assistant._dispatch_prompt', side_effect=AssistantUnavailable('down')):
            resp = self._submit(self.consumable, qty=2)
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data['autoDecided'])               # decision stands despite AI being down
        self.assertIn('Auto-approved', resp.data['autoNote'])   # deterministic templated fallback

    @patch('apps.messaging.assistant.explain_decision', return_value='x')
    def test_flagged_user_still_blocked(self, _mock):
        ad.set_config({'mode': 'auto'})
        self.student.is_flagged = True
        self.student.save(update_fields=['is_flagged'])
        resp = self._submit(self.consumable, qty=1)
        self.assertEqual(resp.status_code, 403)

    def test_config_endpoint_is_admin_only(self):
        self.client.force_authenticate(self.student)
        denied = self.client.post('/api/requests/auto_decision_config/', {'mode': 'auto'}, format='json')
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        updated = self.client.post('/api/requests/auto_decision_config/',
                                   {'mode': 'auto', 'max_auto_qty': 7}, format='json')
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data['mode'], 'auto')
        self.assertEqual(updated.data['max_auto_qty'], 7)
        fetched = self.client.get('/api/requests/auto_decision_config/')
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.data['mode'], 'auto')


class CascadeProtectionTests(APITestCase):
    """Deleting an item or user that has borrow history must be refused (409),
    never cascade-delete the request record."""

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username='cp-admin', password='password', role='ADMIN')
        self.staff = User.objects.create_user(username='cp-staff', password='password', role='STAFF')
        self.borrower = User.objects.create_user(username='cp-borrower', password='password', role='STUDENT')
        self.item = Item.objects.create(
            name='Projector', category=Item.Category.ELECTRONICS, quantity=2,
            status=Item.Status.AVAILABLE, access_level='STUDENT',
        )
        self.req = Request.objects.create(
            item=self.item, item_name=self.item.name, requested_by=self.borrower,
            quantity=1, purpose='x', status='COMPLETED',
        )

    def test_delete_user_with_history_returns_409(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.delete(f'/api/users/{self.borrower.id}/')
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(get_user_model().objects.filter(pk=self.borrower.pk).exists())
        self.assertTrue(Request.objects.filter(pk=self.req.pk).exists())

    def test_delete_item_with_history_returns_409(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.delete(f'/api/inventory/{self.item.id}/')
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(Item.objects.filter(pk=self.item.pk).exists())
        self.assertTrue(Request.objects.filter(pk=self.req.pk).exists())


class NotificationPatchLockdownTests(APITestCase):
    """Generic PATCH must not let a user rewrite a notification's type/message."""

    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='notif-patch', password='password', role='STUDENT')
        self.client.force_authenticate(self.user)

    def test_patch_cannot_change_type_or_message(self):
        notif = Notification.objects.create(
            recipient=self.user, type='STATUS_CHANGE', message='Original',
        )
        resp = self.client.patch(
            f'/api/requests/notifications/{notif.id}/',
            {'type': 'OVERDUE', 'message': 'Forged'}, format='json',
        )
        # Whether the route 405s or silently ignores the read-only fields, the
        # stored type/message must be untouched.
        self.assertIn(resp.status_code, (200, 403, 405))
        notif.refresh_from_db()
        self.assertEqual(notif.type, 'STATUS_CHANGE')
        self.assertEqual(notif.message, 'Original')
