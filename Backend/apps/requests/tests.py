from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.inventory.models import Item
from apps.requests.models import Request


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
