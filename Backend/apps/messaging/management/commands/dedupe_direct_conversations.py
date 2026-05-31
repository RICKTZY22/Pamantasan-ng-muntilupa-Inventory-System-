from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max

from apps.messaging.assistant import ASSISTANT_USERNAME
from apps.messaging.models import Conversation, ConversationMember, Message, dm_key_for_user_ids


class Command(BaseCommand):
    help = 'Merge duplicate 2-person conversations and populate dm_key values.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually merge rows. Without this, the command only reports what would change.',
        )
        parser.add_argument(
            '--assistant-only',
            action='store_true',
            help='Only merge conversations involving the PLMun Assistant user.',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        assistant_only = options['assistant_only']
        groups = defaultdict(list)

        conversations = (
            Conversation.objects
            .prefetch_related('members__user')
            .order_by('created_at', 'id')
        )
        for conv in conversations:
            members = list(conv.members.all())
            if len(members) != 2:
                continue
            if assistant_only and not any(m.user.username == ASSISTANT_USERNAME for m in members):
                continue
            key = dm_key_for_user_ids(members[0].user_id, members[1].user_id)
            if key:
                groups[key].append(conv)

        duplicate_groups = {key: rows for key, rows in groups.items() if len(rows) > 1}
        missing_keys = [rows[0] for key, rows in groups.items() if len(rows) == 1 and rows[0].dm_key != key]

        self.stdout.write(
            f'Found {len(duplicate_groups)} duplicate pair(s), '
            f'{sum(len(rows) - 1 for rows in duplicate_groups.values())} duplicate conversation(s), '
            f'and {len(missing_keys)} conversation(s) missing dm_key.'
        )

        if not apply_changes:
            for key, rows in duplicate_groups.items():
                ids = ', '.join(str(c.id) for c in rows)
                self.stdout.write(f'DRY RUN: {key} -> keep #{rows[0].id}, merge [{ids}]')
            self.stdout.write('Dry run only. Re-run with --apply to modify data.')
            return

        with transaction.atomic():
            for key, rows in groups.items():
                canonical = rows[0]
                for duplicate in rows[1:]:
                    self._merge_conversation(canonical, duplicate)
                Conversation.objects.filter(pk=canonical.pk).update(dm_key=key)
                latest = (
                    Message.objects
                    .filter(conversation=canonical)
                    .aggregate(latest=Max('created_at'))['latest']
                )
                if latest:
                    Conversation.objects.filter(pk=canonical.pk).update(updated_at=latest)

        self.stdout.write(self.style.SUCCESS('Conversation dedupe complete.'))

    def _merge_conversation(self, canonical, duplicate):
        for dup_member in duplicate.members.select_related('user'):
            target, _created = ConversationMember.objects.get_or_create(
                conversation=canonical,
                user=dup_member.user,
            )
            changed = []
            if dup_member.last_read_at and (
                not target.last_read_at or dup_member.last_read_at > target.last_read_at
            ):
                target.last_read_at = dup_member.last_read_at
                changed.append('last_read_at')
            target.is_archived = target.is_archived and dup_member.is_archived
            changed.append('is_archived')
            if target.deleted_at is None or dup_member.deleted_at is None:
                if target.deleted_at is not None:
                    target.deleted_at = None
                    changed.append('deleted_at')
            elif dup_member.deleted_at > target.deleted_at:
                target.deleted_at = dup_member.deleted_at
                changed.append('deleted_at')
            if dup_member.cleared_at and (
                not target.cleared_at or dup_member.cleared_at > target.cleared_at
            ):
                target.cleared_at = dup_member.cleared_at
                changed.append('cleared_at')
            if changed:
                target.save(update_fields=sorted(set(changed)))

        moved = Message.objects.filter(conversation=duplicate).update(conversation=canonical)
        self.stdout.write(f'Merged conversation #{duplicate.id} into #{canonical.id}; moved {moved} message(s).')
        duplicate.delete()
