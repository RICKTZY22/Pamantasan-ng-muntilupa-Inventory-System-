from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _user_from_token(token):
    from rest_framework_simplejwt.tokens import AccessToken
    User = get_user_model()
    try:
        access = AccessToken(token)  # validates signature + expiry
        return User.objects.get(pk=access['user_id'], is_active=True)
    except Exception:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """Authenticate a WebSocket connection from a `?token=<access JWT>` query
    param (SimpleJWT). Sets scope['user']; anonymous if missing/invalid."""

    async def __call__(self, scope, receive, send):
        qs = parse_qs(scope.get('query_string', b'').decode())
        token = (qs.get('token') or [None])[0]
        scope['user'] = await _user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
