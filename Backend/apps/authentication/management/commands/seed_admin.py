"""
Management command: seed_admin
Creates the initial admin account if it doesn't already exist.
Reads credentials from environment variables so they never end up in code.
"""
import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Create the initial admin user from env vars (ADMIN_EMAIL, ADMIN_PASSWORD)'

    def handle(self, *args, **options):
        email = os.environ.get('ADMIN_EMAIL')
        password = os.environ.get('ADMIN_PASSWORD')

        if not email or not password:
            self.stdout.write(self.style.WARNING(
                'ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin seed.'
            ))
            return

        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.SUCCESS(
                f'Admin "{email}" already exists — nothing to do.'
            ))
            return

        User.objects.create_superuser(
            username=email.split('@')[0],  # derive username from email
            email=email,
            password=password,
            role='ADMIN',
            first_name='Admin',
        )
        self.stdout.write(self.style.SUCCESS(
            f'Created admin account: {email}'
        ))
