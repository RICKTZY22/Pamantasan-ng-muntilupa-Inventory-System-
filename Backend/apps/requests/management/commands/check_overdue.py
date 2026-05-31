"""Run the overdue scan on a schedule (Windows Task Scheduler / cron) instead of
relying on someone opening the Requests page.

Examples:
    python manage.py check_overdue

    # Windows Task Scheduler (daily 8am), program/script:
    #   <repo>\\Backend\\venv\\Scripts\\python.exe
    #   args: manage.py check_overdue   (Start in: <repo>\\Backend)

    # Linux cron (daily 8am):
    #   0 8 * * * cd /srv/app/Backend && ./venv/bin/python manage.py check_overdue
"""

from django.core.management.base import BaseCommand

from apps.requests.overdue import run_overdue_scan


class Command(BaseCommand):
    help = 'Scan for overdue borrow requests; notify borrowers + staff and flag users. Idempotent.'

    def handle(self, *args, **options):
        result = run_overdue_scan()
        self.stdout.write(self.style.SUCCESS(
            f"Overdue scan complete: {result['overdue_total']} outstanding overdue item(s), "
            f"{result['notified']} new notification(s) sent."
        ))
