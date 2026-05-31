from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase, APIClient


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
