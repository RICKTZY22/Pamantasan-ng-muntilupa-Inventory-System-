import io
import tempfile

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from PIL import Image as PILImage
from rest_framework import status
from rest_framework.test import APITestCase, APIClient

from apps.authentication.models import AuditLog

User = get_user_model()


@override_settings(REFRESH_COOKIE_SECURE=False, REFRESH_COOKIE_SAMESITE='Lax')
class CookieAuthFlowTests(APITestCase):
    """Refresh token must live in an HttpOnly cookie, never the JSON body."""

    def setUp(self):
        cache.clear()  # reset login rate-limit counters between tests
        self.password = 'StrongPass123!'
        self.user = User.objects.create_user(
            username='cookieuser', email='cookieuser@plmun.edu.ph',
            password=self.password, role=User.Role.STUDENT,
        )

    def _login(self):
        return self.client.post(
            '/api/auth/login/',
            {'email': 'cookieuser@plmun.edu.ph', 'password': self.password},
            format='json',
        )

    def test_login_sets_httponly_cookie_and_omits_refresh_from_body(self):
        resp = self._login()
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access', resp.data)
        self.assertNotIn('refresh', resp.data)          # never exposed to JS
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['path'], '/api/auth/')

    def test_refresh_reads_cookie_and_rotates(self):
        self._login()  # client now holds the refresh cookie
        resp = self.client.post('/api/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access', resp.data)
        self.assertNotIn('refresh', resp.data)
        self.assertIn('refresh_token', resp.cookies)     # rotated cookie reissued

    def test_refresh_without_cookie_returns_401(self):
        clean = APIClient()  # no cookie jar
        resp = clean.post('/api/auth/token/refresh/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_clears_cookie(self):
        self._login()
        resp = self.client.post('/api/auth/logout/', {}, format='json')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        self.assertEqual(cookie.value, '')               # deleted

    def test_register_sets_cookie_and_omits_refresh(self):
        resp = self.client.post('/api/auth/register/', {
            'username': 'cookienew', 'email': 'cookienew@plmun.edu.ph',
            'password': 'StrongPass123!', 'password2': 'StrongPass123!',
            'fullName': 'Cookie New', 'department': 'CICS',
        }, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', resp.data)
        self.assertNotIn('refresh', resp.data)
        self.assertIn('refresh_token', resp.cookies)


class RegistrationRoleTests(APITestCase):
    def _payload(self, **overrides):
        data = {
            'username': 'newstudent',
            'email': 'newstudent@plmun.edu.ph',
            'password': 'StrongPass123!',
            'password2': 'StrongPass123!',
            'fullName': 'New Student',
            'department': 'CICS',
        }
        data.update(overrides)
        return data

    def test_public_registration_cannot_assign_admin_role(self):
        response = self.client.post('/api/auth/register/', self._payload(role='ADMIN'), format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)
        self.assertFalse(User.objects.filter(username='newstudent').exists())

    def test_public_registration_defaults_to_student(self):
        response = self.client.post('/api/auth/register/', self._payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='newstudent')
        self.assertEqual(user.role, User.Role.STUDENT)
        self.assertEqual(response.data['user']['role'], User.Role.STUDENT)

    def test_admin_can_create_staff_user(self):
        admin = User.objects.create_user(
            username='admin',
            email='admin@plmun.edu.ph',
            password='StrongPass123!',
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(admin)

        response = self.client.post(
            '/api/auth/register/',
            self._payload(username='staffer', email='staffer@plmun.edu.ph', role='STAFF'),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username='staffer')
        self.assertEqual(user.role, User.Role.STAFF)
        self.assertEqual(response.data['user']['role'], User.Role.STAFF)


class MaintenanceModeTests(APITestCase):
    def setUp(self):
        cache.delete('plmun_maintenance')
        self.admin = User.objects.create_user(
            username='maint-admin',
            email='maint-admin@plmun.edu.ph',
            password='StrongPass123!',
            role=User.Role.ADMIN,
        )
        self.client.force_authenticate(self.admin)

    def tearDown(self):
        cache.delete('plmun_maintenance')

    def test_invalid_duration_returns_400_instead_of_server_error(self):
        response = self.client.post('/api/auth/maintenance/', {
            'enabled': True,
            'durationMins': 'abc',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('durationMins', response.data['error'])
        self.assertIsNone(cache.get('plmun_maintenance'))

    def test_duration_must_be_in_allowed_range(self):
        response = self.client.post('/api/auth/maintenance/', {
            'enabled': True,
            'durationMins': 0,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('durationMins', response.data['error'])
        self.assertIsNone(cache.get('plmun_maintenance'))

    def test_string_false_disables_maintenance(self):
        cache.set('plmun_maintenance', {'enabled': True, 'endTime': 9999999999999}, timeout=60)

        response = self.client.post('/api/auth/maintenance/', {
            'enabled': 'false',
            'durationMins': 'abc',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['enabled'])
        self.assertIsNone(cache.get('plmun_maintenance'))

    def test_valid_string_duration_enables_maintenance(self):
        response = self.client.post('/api/auth/maintenance/', {
            'enabled': 'true',
            'durationMins': '15',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['enabled'])
        self.assertGreater(response.data['endTime'], 0)
        self.assertIsNotNone(cache.get('plmun_maintenance'))


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class AvatarUploadTests(APITestCase):
    """ProfilePictureView must run avatars through the shared image validator."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='avataruser', email='avataruser@plmun.edu.ph',
            password='StrongPass123!', role=User.Role.STUDENT,
        )
        self.client.force_authenticate(self.user)

    @staticmethod
    def _png_bytes():
        buffer = io.BytesIO()
        PILImage.new('RGB', (2, 2), 'green').save(buffer, format='PNG')
        return buffer.getvalue()

    def test_valid_avatar_accepted(self):
        good = SimpleUploadedFile('me.png', self._png_bytes(), content_type='image/png')
        response = self.client.post('/api/auth/profile/picture/', {'avatar': good}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_avatar_rejected(self):
        bad = SimpleUploadedFile('me.png', b'not really an image', content_type='image/png')
        response = self.client.post('/api/auth/profile/picture/', {'avatar': bad}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class AuditLogViewTests(APITestCase):
    """Staff+ can read; the default view shows only login/logout + approve/reject
    (other recorded actions are hidden but queryable); rows are enriched; clearing
    is admin-only."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username='auditadmin', email='auditadmin@plmun.edu.ph',
            password='StrongPass123!', role=User.Role.ADMIN, first_name='Aud', last_name='Min',
        )
        self.staff = User.objects.create_user(
            username='auditstaff', email='auditstaff@plmun.edu.ph',
            password='StrongPass123!', role=User.Role.STAFF,
        )
        self.student = User.objects.create_user(
            username='auditstudent', email='auditstudent@plmun.edu.ph',
            password='StrongPass123!', role=User.Role.STUDENT,
        )
        AuditLog.objects.create(action=AuditLog.LOGIN, user=self.student, username=self.student.username, details='login')
        AuditLog.objects.create(action=AuditLog.LOGOUT, user=self.student, username=self.student.username, details='logout')
        AuditLog.objects.create(action=AuditLog.REQUEST_APPROVED, user=self.staff, username=self.staff.username, details='Approved request #1')
        AuditLog.objects.create(action=AuditLog.PROFILE_UPDATE, user=self.student, username=self.student.username, details='profile')
        AuditLog.objects.create(action=AuditLog.LOGIN_FAILED, username='ghost', details='bad creds')

    def test_staff_can_list_and_default_hides_noise(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/auth/audit-logs/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        actions = {row['action'] for row in resp.data}
        self.assertLessEqual(actions, {AuditLog.LOGIN, AuditLog.LOGOUT, AuditLog.REQUEST_APPROVED, AuditLog.REQUEST_REJECTED})
        self.assertNotIn(AuditLog.PROFILE_UPDATE, actions)
        self.assertNotIn(AuditLog.LOGIN_FAILED, actions)

    def test_rows_are_enriched(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get('/api/auth/audit-logs/')
        self.assertTrue(resp.data)
        for key in ('name', 'email', 'avatar', 'user', 'action', 'timestamp'):
            self.assertIn(key, resp.data[0])

    def test_action_filter_exposes_hidden(self):
        self.client.force_authenticate(self.staff)
        resp = self.client.get('/api/auth/audit-logs/', {'action': 'Login Failed'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_student_cannot_list(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get('/api/auth/audit-logs/').status_code, status.HTTP_403_FORBIDDEN)

    def test_clear_is_admin_only(self):
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.delete('/api/auth/audit-logs/').status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.delete('/api/auth/audit-logs/').status_code, status.HTTP_200_OK)
