"""
Drop orphan columns left behind by a partially-reverted account-lockout feature.

These three columns exist in the `users` table but are not declared on the
User model, not referenced by any view or serializer, and not produced by any
prior migration. The most likely origin is an earlier "harden security
settings" change that was rolled back at the code level without a matching
schema rollback.

Their NOT NULL constraint blocked inserts that didn't supply a value, which
broke management commands and tests. Dropping them brings the schema back in
sync with the model. If the lockout feature is ever reintroduced, recreate
the columns through a normal model + makemigrations cycle.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('authentication', '0004_auditlog_action_choices'),
    ]

    operations = [
        migrations.RunSQL(
            sql=[
                "ALTER TABLE users DROP COLUMN IF EXISTS failed_login_count;",
                "ALTER TABLE users DROP COLUMN IF EXISTS locked_until;",
                "ALTER TABLE users DROP COLUMN IF EXISTS lockout_offenses;",
            ],
            reverse_sql=[
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ NULL;",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS lockout_offenses INTEGER NOT NULL DEFAULT 0;",
            ],
        ),
    ]
