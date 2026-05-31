# Generated for per-user conversation clearing.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('messaging', '0003_dm_key_and_deleted_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='conversationmember',
            name='cleared_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
