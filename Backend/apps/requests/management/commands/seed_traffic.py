"""Seed bulk students + borrow requests for traffic / volume testing.

    python manage.py seed_traffic                     # 100 students, 1000 requests
    python manage.py seed_traffic --students 500 --requests 5000
    python manage.py seed_traffic --clear             # remove everything this seeded

All seeded rows are tagged so --clear can remove them cleanly:
  - students: username starts with 'seed_student_'
  - requests: purpose starts with '[SEED]'
  - fallback items (only created if inventory was empty): name starts with '[SEED]'
Seeded students share the password 'seedpass123' so you can log in as any of them.
NOTE: this inserts requests directly (bulk), so it does NOT decrement item stock —
it's test data for volume/perf, not a simulation of the real approve flow.
"""

import random
import time

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from apps.inventory.models import Item
from apps.requests.models import Request

User = get_user_model()

SEED_USER_PREFIX = 'seed_student_'
SEED_REQUEST_TAG = '[SEED]'
SEED_PASSWORD = 'seedpass123'

# (status, weight). APPROVED entries may be backdated into overdue territory.
STATUS_WEIGHTS = [
    ('PENDING', 25), ('APPROVED', 30), ('COMPLETED', 15),
    ('RETURNED', 20), ('REJECTED', 5), ('CANCELLED', 5),
]
DEPARTMENTS = ['CICS', 'CEA', 'CBA', 'CAS', 'CTHM', 'CON']
PURPOSES = ['Class activity', 'Lab session', 'Org event', 'Research', 'Presentation', 'Workshop']


class Command(BaseCommand):
    help = 'Seed bulk students and borrow requests for traffic/volume testing.'

    def add_arguments(self, parser):
        parser.add_argument('--students', type=int, default=100)
        parser.add_argument('--requests', type=int, default=1000)
        parser.add_argument('--clear', action='store_true', help='Delete all seeded data and exit.')

    def handle(self, *args, **opts):
        if opts['clear']:
            return self._clear()

        n_students = opts['students']
        n_requests = opts['requests']
        started = time.monotonic()

        # ── Items to borrow against ──
        items = list(Item.objects.all()[:100])
        if not items:
            items = self._make_fallback_items()
            self.stdout.write(f'  Inventory was empty — created {len(items)} fallback items.')

        # ── Students (bulk, one shared password hash for speed) ──
        existing = set(User.objects.filter(username__startswith=SEED_USER_PREFIX)
                       .values_list('username', flat=True))
        pwd = make_password(SEED_PASSWORD)
        new_users = []
        for i in range(1, n_students + 1):
            uname = f'{SEED_USER_PREFIX}{i:05d}'
            if uname in existing:
                continue
            new_users.append(User(
                username=uname,
                email=f'seed.student{i:05d}@plmun.edu.ph',
                first_name='Seed', last_name=f'Student {i:05d}',
                role='STUDENT', password=pwd,
                student_id=f'2026-{i:05d}',
                department=random.choice(DEPARTMENTS),
            ))
        if new_users:
            User.objects.bulk_create(new_users, batch_size=500, ignore_conflicts=True)
        students = list(User.objects.filter(username__startswith=SEED_USER_PREFIX))
        self.stdout.write(f'  Students: {len(students)} total ({len(new_users)} new).')

        # ── Requests (bulk) ──
        statuses = [s for s, _ in STATUS_WEIGHTS]
        weights = [w for _, w in STATUS_WEIGHTS]
        now = timezone.now()
        reqs = []
        for _ in range(n_requests):
            student = random.choice(students)
            item = random.choice(items)
            status = random.choices(statuses, weights=weights, k=1)[0]
            req = Request(
                item=item, item_name=item.name, requested_by=student,
                quantity=random.randint(1, 3),
                purpose=f'{SEED_REQUEST_TAG} {random.choice(PURPOSES)}',
                status=status, priority=item.priority,
            )
            if status in ('APPROVED', 'COMPLETED', 'RETURNED'):
                req.approved_at = now - timedelta(days=random.randint(0, 20))
                if status == 'APPROVED':
                    # ~40% overdue (due in the past), rest due soon.
                    days = -random.randint(1, 10) if random.random() < 0.4 else random.randint(1, 14)
                    req.expected_return = now + timedelta(days=days)
                if status == 'RETURNED':
                    req.returned_at = now - timedelta(days=random.randint(0, 10))
            reqs.append(req)
        Request.objects.bulk_create(reqs, batch_size=1000)

        elapsed = time.monotonic() - started
        overdue = Request.objects.filter(
            purpose__startswith=SEED_REQUEST_TAG, status='APPROVED', expected_return__lt=now,
        ).count()
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(reqs)} requests across {len(students)} students in {elapsed:.1f}s '
            f'(~{overdue} overdue). Login as any: <username> / {SEED_PASSWORD}'
        ))

    def _make_fallback_items(self):
        cats = ['ELECTRONICS', 'FURNITURE', 'EQUIPMENT', 'SUPPLIES', 'OTHER']
        items = [
            Item(name=f'{SEED_REQUEST_TAG} Test Item {i:02d}', category=random.choice(cats),
                 quantity=random.randint(5, 50), status='AVAILABLE', access_level='STUDENT',
                 is_returnable=True, priority='MEDIUM')
            for i in range(1, 11)
        ]
        Item.objects.bulk_create(items)
        return list(Item.objects.filter(name__startswith=SEED_REQUEST_TAG))

    def _clear(self):
        reqs = Request.objects.filter(purpose__startswith=SEED_REQUEST_TAG)
        rc = reqs.count(); reqs.delete()
        # any requests left on seed students (created via the app, no tag)
        extra = Request.objects.filter(requested_by__username__startswith=SEED_USER_PREFIX)
        ec = extra.count(); extra.delete()
        users = User.objects.filter(username__startswith=SEED_USER_PREFIX)
        uc = users.count(); users.delete()
        items = Item.objects.filter(name__startswith=SEED_REQUEST_TAG)
        ic = items.count(); items.delete()
        self.stdout.write(self.style.SUCCESS(
            f'Cleared seed data: {rc + ec} requests, {uc} students, {ic} fallback items.'
        ))
