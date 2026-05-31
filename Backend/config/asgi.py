"""
ASGI config for PLMun Nexus — serves HTTP (Django) and WebSocket (Channels).

For more information, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import logging
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django  # noqa: E402

django.setup()

from django.core.asgi import get_asgi_application  # noqa: E402

django_asgi_app = get_asgi_application()

logger = logging.getLogger('apps')

# Import Channels bits AFTER django.setup() so the app registry is ready.
# Wrapped so that if an import error sneaks in during a dev autoreload, the
# cause is logged clearly (then re-raised) instead of leaving a dead ASGI app.
try:
    from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
    from apps.messaging.middleware import JWTAuthMiddleware  # noqa: E402
    from apps.messaging.routing import websocket_urlpatterns  # noqa: E402

    application = ProtocolTypeRouter({
        'http': django_asgi_app,
        'websocket': JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
    })
except Exception:  # pragma: no cover - startup diagnostics
    logging.getLogger('apps').exception(
        'Failed to build the Channels ASGI application — WebSocket routing is unavailable'
    )
    raise
