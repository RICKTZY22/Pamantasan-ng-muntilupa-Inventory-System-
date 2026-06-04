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


def _token_from_scope(scope):
    protocols = [
        item.decode() if isinstance(item, bytes) else str(item)
        for item in scope.get('subprotocols', [])
    ]
    if 'plmun.jwt' in protocols:
        idx = protocols.index('plmun.jwt')
        if idx + 1 < len(protocols):
            return protocols[idx + 1]

    # Backward compatibility for older clients.
    qs = parse_qs(scope.get('query_string', b'').decode())
    return (qs.get('token') or [None])[0]


class JWTAuthMiddleware(BaseMiddleware):
    """Authenticate WebSockets with the access JWT from the handshake."""

    async def __call__(self, scope, receive, send):
        token = _token_from_scope(scope)
        scope['user'] = await _user_from_token(token) if token else AnonymousUser()
        return await super().__call__(scope, receive, send)
