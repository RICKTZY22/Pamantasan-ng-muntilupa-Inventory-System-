"""
Management command: seed_demo

Populates the database with realistic demo data for portfolio/review purposes:
    * Four users — one per role (Student, Faculty, Staff, Admin)
    * ~15 inventory items spanning every category and access level
    * Eight historical requests across the full state machine
      (PENDING, APPROVED, COMPLETED, RETURNED, REJECTED, CANCELLED)

Idempotent — safe to re-run. Detects existing demo users by username prefix
and skips re-creation; existing items/requests with the same demo markers
are likewise left alone.

Run with:
    python manage.py seed_demo
    python manage.py seed_demo --reset     # wipe demo data first
"""
from datetime import timedelta
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Item
from apps.requests.models import Request

User = get_user_model()


DEFAULT_DEMO_PASSWORD = 'demo_pass_2026'
DEMO_PASSWORD_ENV = 'DEMO_PASSWORD'

DEMO_USERS = [
    {
        'username': 'demo_student',
        'email': 'student@demo.plmun.local',
        'first_name': 'Demo',
        'last_name': 'Student',
        'role': 'STUDENT',
        'department': 'BSCS',
        'student_id': '2026-0001',
    },
    {
        'username': 'demo_faculty',
        'email': 'faculty@demo.plmun.local',
        'first_name': 'Demo',
        'last_name': 'Faculty',
        'role': 'FACULTY',
        'department': 'CICS',
        'student_id': '',
    },
    {
        'username': 'demo_staff',
        'email': 'staff@demo.plmun.local',
        'first_name': 'Demo',
        'last_name': 'Staff',
        'role': 'STAFF',
        'department': 'Property Custodian',
        'student_id': '',
    },
    {
        'username': 'demo_admin',
        'email': 'admin@demo.plmun.local',
        'first_name': 'Demo',
        'last_name': 'Admin',
        'role': 'ADMIN',
        'department': 'IT Office',
        'student_id': '',
    },
]


DEMO_ITEMS = [
    # name, category, quantity, status, access_level, location, priority, duration_days
    ('Dell Latitude 5420 Laptop',     'ELECTRONICS', 8,  'AVAILABLE',   'FACULTY', 'IT Storage',         'HIGH',   3),
    ('Epson PowerLite Projector',     'ELECTRONICS', 5,  'AVAILABLE',   'FACULTY', 'Media Center',       'HIGH',   1),
    ('Logitech HD Webcam C920',       'ELECTRONICS', 12, 'AVAILABLE',   'STUDENT', 'Media Center',       'MEDIUM', 7),
    ('Anker USB-C Hub',               'ELECTRONICS', 15, 'AVAILABLE',   'STUDENT', 'IT Storage',         'LOW',    14),
    ('Extension Cord (10m)',          'ELECTRONICS', 20, 'AVAILABLE',   'STUDENT', 'IT Storage',         'LOW',    7),
    ('Folding Table',                 'FURNITURE',   6,  'AVAILABLE',   'STUDENT', 'Gymnasium Storage',  'MEDIUM', 1),
    ('Stackable Chair',               'FURNITURE',   40, 'AVAILABLE',   'STUDENT', 'Gymnasium Storage',  'LOW',    1),
    ('Whiteboard (Mobile)',           'FURNITURE',   3,  'AVAILABLE',   'FACULTY', 'Faculty Room',       'MEDIUM', 1),
    ('Volleyball',                    'EQUIPMENT',   10, 'AVAILABLE',   'STUDENT', 'PE Storage',         'LOW',    1),
    ('Basketball',                    'EQUIPMENT',   8,  'AVAILABLE',   'STUDENT', 'PE Storage',         'LOW',    1),
    ('Soldering Iron Kit',            'EQUIPMENT',   4,  'AVAILABLE',   'FACULTY', 'IT Storage',         'HIGH',   7),
    ('Microscope (Compound)',         'EQUIPMENT',   6,  'AVAILABLE',   'FACULTY', 'Lab Room 2',         'HIGH',   1),
    ('Whiteboard Marker (Box of 12)', 'SUPPLIES',    3,  'AVAILABLE',   'STUDENT', 'Faculty Room',       'LOW',    None),
    ('Bond Paper Ream (A4)',          'SUPPLIES',    25, 'AVAILABLE',   'STUDENT', 'Admin Building',     'LOW',    None),
    ('First-Aid Kit',                 'OTHER',       2,  'MAINTENANCE', 'STAFF',   'Admin Building',     'HIGH',   None),
]


class Command(BaseCommand):
    help = 'Seed the database with demo users, items, and requests for portfolio/review use.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Delete existing demo data before reseeding.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        # Demo-only fallback para gumana agad sa reviewers; override via env for real deployments.
        demo_password = os.environ.get(DEMO_PASSWORD_ENV, DEFAULT_DEMO_PASSWORD)

        if options['reset']:
            self._reset()

        users = self._seed_users(demo_password)
        items = self._seed_items()
        self._seed_requests(users, items)

        self._print_credentials(demo_password)

    # ── reset ────────────────────────────────────────────────────────────
    def _reset(self):
        self.stdout.write(self.style.WARNING('Resetting demo data...'))
        demo_usernames = [u['username'] for u in DEMO_USERS]
        Request.objects.filter(requested_by__username__in=demo_usernames).delete()
        User.objects.filter(username__in=demo_usernames).delete()
        Item.objects.filter(name__in=[i[0] for i in DEMO_ITEMS]).delete()

    # ── users ────────────────────────────────────────────────────────────
    def _seed_users(self, demo_password):
        users = {}
        for spec in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=spec['username'],
                defaults={
                    'email': spec['email'],
                    'first_name': spec['first_name'],
                    'last_name': spec['last_name'],
                    'role': spec['role'],
                    'department': spec['department'],
                    'student_id': spec['student_id'],
                    'is_staff': spec['role'] == 'ADMIN',
                    'is_superuser': spec['role'] == 'ADMIN',
                },
            )
            if created:
                user.set_password(demo_password)
                user.save(update_fields=['password'])
                self.stdout.write(self.style.SUCCESS(f'  + user {user.username} ({user.role})'))
            else:
                self.stdout.write(f'  ~ user {user.username} already exists, skipping')
            users[spec['role']] = user
        return users

    # ── items ────────────────────────────────────────────────────────────
    def _seed_items(self):
        items = {}
        for (name, category, qty, status, access, location, priority, days) in DEMO_ITEMS:
            item, created = Item.objects.get_or_create(
                name=name,
                defaults={
                    'category': category,
                    'quantity': qty,
                    'status': status,
                    'access_level': access,
                    'location': location,
                    'priority': priority,
                    'is_returnable': days is not None,
                    'borrow_duration': days,
                    'borrow_duration_unit': 'DAYS' if days else 'DAYS',
                    'description': f'Demo seed item — {category.title()}',
                },
            )
            if created:
                self.stdout.write(self.style.SUCCESS(f'  + item {item.name}'))
            else:
                self.stdout.write(f'  ~ item {item.name} already exists, skipping')
            items[name] = item
        return items

    # ── requests ─────────────────────────────────────────────────────────
    def _seed_requests(self, users, items):
        now = timezone.now()
        student = users['STUDENT']
        faculty = users['FACULTY']
        staff = users['STAFF']

        # (item_name, requester, qty, status, days_ago_created, purpose, extras)
        scenarios = [
            ('Epson PowerLite Projector', faculty, 1, 'PENDING', 0,
             'For Tuesday lecture on Distributed Systems.', {}),

            ('Logitech HD Webcam C920', student, 1, 'PENDING', 1,
             'Capstone demo recording.', {}),

            ('Dell Latitude 5420 Laptop', faculty, 1, 'APPROVED', 2,
             'Off-site grading session this weekend.',
             {'approved_by': staff, 'approved_days_ago': 1}),

            ('Volleyball', student, 4, 'APPROVED', 3,
             'Intramurals qualifier match.',
             {'approved_by': staff, 'approved_days_ago': 2}),

            ('Folding Table', student, 2, 'COMPLETED', 10,
             'Org booth during university week.',
             {'approved_by': staff, 'approved_days_ago': 9}),

            ('Stackable Chair', faculty, 12, 'RETURNED', 30,
             'Faculty meeting overflow seating.',
             {'approved_by': staff, 'approved_days_ago': 29, 'returned_days_ago': 25}),

            ('Microscope (Compound)', student, 1, 'REJECTED', 5,
             'Personal project.',
             {'rejection_reason': 'Microscopes restricted to faculty supervision.'}),

            ('Basketball', student, 2, 'CANCELLED', 4,
             'Practice session — cancelled, rescheduled.', {}),
        ]

        for (item_name, requester, qty, status, days_ago, purpose, extras) in scenarios:
            item = items.get(item_name)
            if item is None:
                continue

            created_at = now - timedelta(days=days_ago)

            # Idempotency: skip if a matching demo request already exists.
            if Request.objects.filter(
                item=item,
                requested_by=requester,
                purpose=purpose,
            ).exists():
                self.stdout.write(f'  ~ request for {item_name} by {requester.username} already exists, skipping')
                continue

            request = Request.objects.create(
                item=item,
                item_name=item.name,
                requested_by=requester,
                quantity=qty,
                purpose=purpose,
                status=status,
                priority='MEDIUM',
                expected_return=created_at + timedelta(days=item.borrow_duration or 3),
            )

            # Backdate created_at (auto_now_add can't be set on create).
            Request.objects.filter(pk=request.pk).update(
                created_at=created_at,
                request_date=created_at.date(),
            )

            if extras.get('approved_by'):
                request.approved_by = extras['approved_by']
                request.approved_at = now - timedelta(days=extras['approved_days_ago'])
            if extras.get('returned_days_ago') is not None:
                request.returned_at = now - timedelta(days=extras['returned_days_ago'])
            if extras.get('rejection_reason'):
                request.rejection_reason = extras['rejection_reason']
            request.save()

            self.stdout.write(self.style.SUCCESS(f'  + request {item_name} ({status})'))

    # ── credentials banner ───────────────────────────────────────────────
    def _print_credentials(self, demo_password):
        bar = '-' * 60
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(bar))
        self.stdout.write(self.style.SUCCESS(' Demo accounts seeded -- log in with any of:'))
        self.stdout.write(self.style.SUCCESS(bar))
        for spec in DEMO_USERS:
            self.stdout.write(f"   {spec['role']:8s}  {spec['username']:14s}  password: {demo_password}")
        self.stdout.write(self.style.SUCCESS(bar))
