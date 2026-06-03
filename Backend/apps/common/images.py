"""Shared image-upload validation.

Every user-supplied image (profile avatar, inventory item image, chat
attachment) goes through `validate_image_upload` so the allowlist stays
consistent in one place. The client controls the filename and Content-Type, and
Django serves media with a Content-Type derived from the file extension, so we
enforce a size cap + MIME/extension allowlist AND decode the bytes to confirm
the real format. This blocks renamed/polyglot files (e.g. an `.html` file with a
valid-image header) from being stored and later served as active content.
"""

import os

from PIL import Image, UnidentifiedImageError

# Pillow's normalized format names alongside the MIME/extension allowlist.
ALLOWED_IMAGE_MIME = {'image/jpeg', 'image/png', 'image/webp'}
ALLOWED_IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp'}
ALLOWED_IMAGE_FORMATS = {'JPEG', 'PNG', 'WEBP'}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

_ALLOWED_LABEL = 'Only JPEG, PNG, and WebP images are allowed.'


def validate_image_upload(file, max_bytes=MAX_IMAGE_BYTES):
    """Validate an uploaded image file.

    Returns an error string if the file is missing, too large, has a
    disallowed MIME/extension, or does not decode to an allowed image format.
    Returns ``None`` when the file is a safe, allowed image. The file stream is
    re-seeked to 0 on the way out so the caller can save it afterwards.
    """
    if file is None:
        return 'No image file provided.'

    size = getattr(file, 'size', None)
    if size is not None and size > max_bytes:
        return f'Image must be {max_bytes // (1024 * 1024)} MB or smaller.'

    # Cheap checks first: claimed MIME type and extension.
    if getattr(file, 'content_type', None) not in ALLOWED_IMAGE_MIME:
        return _ALLOWED_LABEL

    ext = os.path.splitext(getattr(file, 'name', '') or '')[1].lower()
    if ext not in ALLOWED_IMAGE_EXT:
        return f'File extension "{ext or "(none)"}" is not allowed.'

    # Content validation: the client can lie about Content-Type and rename a
    # file, so decode the actual bytes and confirm the detected format. verify()
    # consumes the stream, so we re-seek before returning.
    try:
        file.seek(0)
        with Image.open(file) as img:
            detected_format = img.format
            img.verify()
    except (UnidentifiedImageError, OSError, ValueError):
        return 'File could not be read as a valid image.'
    finally:
        try:
            file.seek(0)
        except (OSError, ValueError):
            pass

    if detected_format not in ALLOWED_IMAGE_FORMATS:
        return _ALLOWED_LABEL

    return None
