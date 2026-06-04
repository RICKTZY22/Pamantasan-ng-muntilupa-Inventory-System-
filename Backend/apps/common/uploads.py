"""Upload path helpers for user-supplied files."""

from pathlib import Path
from uuid import uuid4


def _image_upload_path(folder, filename):
    ext = Path(filename or '').suffix.lower()
    if ext not in {'.jpg', '.jpeg', '.png', '.webp'}:
        ext = '.bin'
    return f'{folder}/{uuid4().hex}{ext}'


def avatar_upload_path(instance, filename):
    return _image_upload_path('avatars', filename)


def item_upload_path(instance, filename):
    return _image_upload_path('items', filename)


def chat_upload_path(instance, filename):
    return _image_upload_path('chat', filename)
