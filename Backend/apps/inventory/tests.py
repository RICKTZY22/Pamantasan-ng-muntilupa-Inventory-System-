from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.inventory.models import Item


class InventoryXssTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='staff',
            password='password',
            role='STAFF',
        )
        self.client.force_authenticate(self.user)

    def test_create_item_strips_html_from_user_controlled_fields(self):
        response = self.client.post('/api/inventory/', {
            'name': '<script>alert(1)</script>Projector',
            'category': Item.Category.ELECTRONICS,
            'quantity': 1,
            'status': Item.Status.AVAILABLE,
            'location': '<img src=x onerror=alert(1)>Room 101',
            'description': '<svg onload=alert(1)>Useful item',
            'accessLevel': 'STUDENT',
            'priority': Item.Priority.MEDIUM,
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertNotIn('<', response.data['name'])
        self.assertNotIn('<', response.data['location'])
        self.assertNotIn('<', response.data['description'])
        self.assertEqual(response.data['location'], 'Room 101')

    def test_status_note_strips_html_before_storage(self):
        item = Item.objects.create(
            name='Projector',
            category=Item.Category.ELECTRONICS,
            quantity=1,
            status=Item.Status.AVAILABLE,
            access_level='STUDENT',
        )

        response = self.client.post(f'/api/inventory/{item.id}/change_status/', {
            'status': Item.Status.MAINTENANCE,
            'note': '<img src=x onerror=alert(1)>Needs cleaning',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['statusNote'], 'Needs cleaning')
        self.assertNotIn('<', response.data['statusNote'])
