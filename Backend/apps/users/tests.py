from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase


User = get_user_model()


class UserManagementSafetyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin',
            email='admin@plmun.edu.ph',
            password='StrongPass123!',
            role=User.Role.ADMIN,
        )
        self.other_admin = User.objects.create_user(
            username='other-admin',
            email='other-admin@plmun.edu.ph',
            password='StrongPass123!',
            role=User.Role.ADMIN,
        )
        self.student = User.objects.create_user(
            username='student',
            email='student@plmun.edu.ph',
            password='StrongPass123!',
            role=User.Role.STUDENT,
        )
        self.client.force_authenticate(self.admin)

    def test_create_user_endpoint_is_disabled(self):
        # Creation must go through /auth/register/ (sets+hashes a password); the
        # bare ModelViewSet create made passwordless, unusable accounts (#27).
        before = User.objects.count()
        response = self.client.post('/api/users/', {
            'username': 'ghost', 'email': 'ghost@plmun.edu.ph', 'role': User.Role.STUDENT,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(User.objects.count(), before)

    def test_admin_cannot_remove_own_admin_role(self):
        response = self.client.put(f'/api/users/{self.admin.id}/role/', {'role': User.Role.STAFF}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)

    def test_admin_cannot_deactivate_self(self):
        response = self.client.post(f'/api/users/{self.admin.id}/toggle_status/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_admin_cannot_delete_self(self):
        response = self.client.delete(f'/api/users/{self.admin.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_last_active_admin_cannot_be_deactivated_or_demoted(self):
        self.other_admin.is_active = False
        self.other_admin.save(update_fields=['is_active'])

        deactivate = self.client.post(f'/api/users/{self.admin.id}/toggle_status/')
        demote = self.client.put(f'/api/users/{self.admin.id}/role/', {'role': User.Role.STAFF}, format='json')

        self.assertEqual(deactivate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(demote.status_code, status.HTTP_400_BAD_REQUEST)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)
        self.assertEqual(self.admin.role, User.Role.ADMIN)

    def test_generic_user_update_cannot_change_roles(self):
        self.client.patch(
            f'/api/users/{self.admin.id}/',
            {'role': User.Role.STAFF, 'first_name': 'Renamed'},
            format='json',
        )
        self.client.patch(
            f'/api/users/{self.student.id}/',
            {'role': User.Role.ADMIN},
            format='json',
        )

        self.admin.refresh_from_db()
        self.student.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.ADMIN)
        self.assertEqual(self.admin.first_name, 'Renamed')
        self.assertEqual(self.student.role, User.Role.STUDENT)

    def test_guarded_role_endpoint_still_changes_allowed_role(self):
        response = self.client.put(f'/api/users/{self.student.id}/role/', {'role': User.Role.STAFF}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertEqual(self.student.role, User.Role.STAFF)

    def test_admin_can_unflag_user_without_resetting_overdue_count(self):
        self.student.is_flagged = True
        self.student.overdue_count = 3
        self.student.save(update_fields=['is_flagged', 'overdue_count'])

        response = self.client.post(f'/api/users/{self.student.id}/unflag/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.student.refresh_from_db()
        self.assertFalse(self.student.is_flagged)
        self.assertEqual(self.student.overdue_count, 3)
        self.assertFalse(response.data['user']['isFlagged'])
        self.assertEqual(response.data['user']['overdueCount'], 3)

    def test_user_stats_include_flagged_count(self):
        self.student.is_flagged = True
        self.student.save(update_fields=['is_flagged'])

        response = self.client.get('/api/users/stats/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['flagged'], 1)
