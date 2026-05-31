# Generated for direct-message identity and per-user hidden conversations.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('messaging', '0002_messagereaction'),
    ]

    operations = [
        migrations.AddField(
            model_name='conversation',
            name='dm_key',
            field=models.CharField(blank=True, db_index=True, help_text='Sorted member-id pair for 2-person direct messages.', max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='conversationmember',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='conversationmember',
            index=models.Index(fields=['user', 'deleted_at'], name='conversatio_user_id_99946d_idx'),
        ),
    ]
