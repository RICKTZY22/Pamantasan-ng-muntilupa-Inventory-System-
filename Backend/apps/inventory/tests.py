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

    def test_staff_can_create_and_update_zero_stock_items(self):
        create = self.client.post('/api/inventory/', {
            'name': 'Temporary ID Cards',
            'category': Item.Category.SUPPLIES,
            'quantity': 0,
            'status': Item.Status.AVAILABLE,
            'location': 'Registrar',
            'description': '',
            'accessLevel': 'STUDENT',
            'priority': Item.Priority.LOW,
        }, format='json')

        self.assertEqual(create.status_code, 201)
        self.assertEqual(create.data['quantity'], 0)

        update = self.client.patch(f"/api/inventory/{create.data['id']}/", {
            'quantity': 0,
            'priority': Item.Priority.HIGH,
        }, format='json')

        self.assertEqual(update.status_code, 200)
        self.assertEqual(update.data['quantity'], 0)
        self.assertEqual(update.data['priority'], Item.Priority.HIGH)

    def test_negative_stock_is_rejected(self):
        response = self.client.post('/api/inventory/', {
            'name': 'Broken Counter',
            'category': Item.Category.SUPPLIES,
            'quantity': -1,
            'status': Item.Status.AVAILABLE,
            'location': 'Storage',
            'description': '',
            'accessLevel': 'STUDENT',
            'priority': Item.Priority.LOW,
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('quantity', response.data)

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

    def test_invalid_maintenance_eta_is_rejected(self):
        item = Item.objects.create(
            name='Projector',
            category=Item.Category.ELECTRONICS,
            quantity=1,
            status=Item.Status.AVAILABLE,
            access_level='STUDENT',
        )

        response = self.client.post(f'/api/inventory/{item.id}/change_status/', {
            'status': Item.Status.MAINTENANCE,
            'maintenanceEta': 'next Friday',
        }, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('maintenance ETA', response.data['detail'])

    def test_valid_maintenance_eta_is_stored(self):
        item = Item.objects.create(
            name='Projector',
            category=Item.Category.ELECTRONICS,
            quantity=1,
            status=Item.Status.AVAILABLE,
            access_level='STUDENT',
        )

        response = self.client.post(f'/api/inventory/{item.id}/change_status/', {
            'status': Item.Status.MAINTENANCE,
            'maintenanceEta': '2026-06-01T08:30:00',
        }, format='json')

        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertIsNotNone(item.maintenance_eta)
