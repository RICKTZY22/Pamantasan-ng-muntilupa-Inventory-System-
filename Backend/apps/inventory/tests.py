import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image as PILImage
from rest_framework.test import APITestCase

from apps.common.images import validate_image_upload
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


class ImageUploadValidatorTests(TestCase):
    """Unit tests for the shared image-upload allowlist used by avatars, item
    images, and chat attachments (apps.common.images.validate_image_upload)."""

    @staticmethod
    def _png_bytes(size=(2, 2)):
        buffer = io.BytesIO()
        PILImage.new('RGB', size, 'red').save(buffer, format='PNG')
        return buffer.getvalue()

    def _upload(self, name, content, content_type):
        return SimpleUploadedFile(name, content, content_type=content_type)

    def test_accepts_real_png(self):
        ok = self._upload('photo.png', self._png_bytes(), 'image/png')
        self.assertIsNone(validate_image_upload(ok))

    def test_rejects_missing_file(self):
        self.assertIsNotNone(validate_image_upload(None))

    def test_rejects_oversized_file(self):
        big = self._upload('photo.png', self._png_bytes(), 'image/png')
        self.assertIsNotNone(validate_image_upload(big, max_bytes=10))

    def test_rejects_disallowed_mime(self):
        txt = self._upload('notes.txt', b'hello world', 'text/plain')
        self.assertIsNotNone(validate_image_upload(txt))

    def test_rejects_polyglot_extension_even_with_image_bytes(self):
        # Valid PNG bytes but an .html name + html content-type → must be rejected
        # (this is the stored-XSS-via-renamed-upload vector).
        polyglot = self._upload('evil.html', self._png_bytes(), 'text/html')
        self.assertIsNotNone(validate_image_upload(polyglot))

    def test_rejects_non_image_bytes_with_image_extension(self):
        fake = self._upload('photo.png', b'this is not an image', 'image/png')
        self.assertIsNotNone(validate_image_upload(fake))


class ItemImageUploadTests(APITestCase):
    """The item create/update serializer must run uploads through the validator."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='staff_img', password='password', role='STAFF',
        )
        self.client.force_authenticate(self.user)

    def _png_bytes(self):
        buffer = io.BytesIO()
        PILImage.new('RGB', (2, 2), 'blue').save(buffer, format='PNG')
        return buffer.getvalue()

    def _create(self, image_file):
        return self.client.post('/api/inventory/', {
            'name': 'Camera',
            'category': Item.Category.ELECTRONICS,
            'quantity': 1,
            'status': Item.Status.AVAILABLE,
            'location': 'Room 1',
            'accessLevel': 'STUDENT',
            'priority': Item.Priority.MEDIUM,
            'imageUrl': image_file,
        }, format='multipart')

    def test_item_create_accepts_valid_image(self):
        good = SimpleUploadedFile('cam.png', self._png_bytes(), content_type='image/png')
        self.assertEqual(self._create(good).status_code, 201)

    def test_item_create_rejects_non_image_upload(self):
        bad = SimpleUploadedFile('cam.png', b'definitely not an image', content_type='image/png')
        response = self._create(bad)
        self.assertEqual(response.status_code, 400)
        self.assertIn('imageUrl', response.data)

    def test_item_create_without_image_still_works(self):
        response = self.client.post('/api/inventory/', {
            'name': 'No Image Item',
            'category': Item.Category.ELECTRONICS,
            'quantity': 1,
            'status': Item.Status.AVAILABLE,
            'location': 'Room 1',
            'accessLevel': 'STUDENT',
            'priority': Item.Priority.MEDIUM,
        }, format='json')
        self.assertEqual(response.status_code, 201)


class ItemStatusWriteProtectionTests(APITestCase):
    """Item status changes only via the audited change_status action; direct
    create/PATCH of status is ignored (finding N2)."""

    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username='staff_status', password='password', role='STAFF',
        )
        self.client.force_authenticate(self.staff)

    def test_create_ignores_client_status(self):
        response = self.client.post('/api/inventory/', {
            'name': 'Projector', 'category': Item.Category.ELECTRONICS, 'quantity': 1,
            'status': Item.Status.RETIRED, 'location': 'Room 1',
            'accessLevel': 'STUDENT', 'priority': Item.Priority.MEDIUM,
        }, format='json')
        self.assertEqual(response.status_code, 201)
        item = Item.objects.get(name='Projector')
        self.assertNotEqual(item.status, Item.Status.RETIRED)

    def test_patch_cannot_change_status(self):
        item = Item.objects.create(
            name='Camera', category=Item.Category.ELECTRONICS, quantity=1,
            status=Item.Status.AVAILABLE, access_level='STUDENT',
        )
        self.client.patch(f'/api/inventory/{item.id}/', {'status': Item.Status.RETIRED}, format='json')
        item.refresh_from_db()
        self.assertEqual(item.status, Item.Status.AVAILABLE)


class InventoryStatsAvailableTests(APITestCase):
    """'available' must count only AVAILABLE items that are actually in stock
    (quantity > 0), matching what the Reports 'Available items' card shows."""

    def setUp(self):
        self.staff = get_user_model().objects.create_user(
            username='stats_staff', password='password', role='STAFF',
        )
        self.client.force_authenticate(self.staff)

    def test_available_excludes_zero_quantity_and_non_available(self):
        Item.objects.create(name='In Stock', category=Item.Category.ELECTRONICS,
                            quantity=3, status=Item.Status.AVAILABLE, access_level='STUDENT')
        Item.objects.create(name='Zero Stock', category=Item.Category.ELECTRONICS,
                            quantity=0, status=Item.Status.AVAILABLE, access_level='STUDENT')
        Item.objects.create(name='Busy', category=Item.Category.ELECTRONICS,
                            quantity=2, status=Item.Status.IN_USE, access_level='STUDENT')

        resp = self.client.get('/api/inventory/stats/')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['total'], 3)
        self.assertEqual(resp.data['available'], 1)   # only the in-stock AVAILABLE item
        self.assertEqual(resp.data['outOfStock'], 1)
