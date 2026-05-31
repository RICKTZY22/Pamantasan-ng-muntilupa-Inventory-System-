"""Shared DRF helpers."""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_handler

logger = logging.getLogger('apps')


def exception_handler(exc, context):
    """Custom DRF exception handler.

    DRF's default cleanly converts APIException / Http404 / PermissionDenied
    into 4xx responses. When it returns None the exception is unexpected (a real
    500) — we log it with a full traceback (so failures stop being invisible)
    and return a clean JSON 500 instead of an HTML error page, which the SPA can
    handle gracefully.
    """
    response = drf_default_handler(exc, context)
    if response is not None:
        return response

    view = context.get('view')
    request = context.get('request')
    logger.error(
        'Unhandled API exception in %s (%s %s)',
        view.__class__.__name__ if view is not None else 'unknown',
        getattr(request, 'method', '?'),
        getattr(request, 'path', '?'),
        exc_info=exc,
    )
    return Response(
        {'detail': 'A server error occurred. Please try again.'},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
