"""Custom middleware for PLMun Nexus."""

import time

from django.core.cache import cache
from django.http import JsonResponse
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken


class CSPMiddleware:
    """
    Injects Content-Security-Policy header into all responses.
    Place this AFTER SecurityMiddleware in MIDDLEWARE list.
    """

    # Default policy — override via Django settings `CSP_POLICY` dict
    DEFAULT_POLICY = {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        'font-src': ["'self'", "https://fonts.gstatic.com"],
        'img-src': ["'self'", "data:", "blob:", "https:"],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
    }

    def __init__(self, get_response):
        self.get_response = get_response
        # Allow overriding via settings
        from django.conf import settings
        self.policy = getattr(settings, 'CSP_POLICY', self.DEFAULT_POLICY)

    def __call__(self, request):
        response = self.get_response(request)
        # Build CSP header string
        directives = []
        for key, values in self.policy.items():
            directives.append(f"{key} {' '.join(values)}")
        response['Content-Security-Policy'] = '; '.join(directives)
        return response


class MaintenanceModeMiddleware:
    """Blocks student/faculty API access while maintenance mode is active."""

    CACHE_KEY = 'plmun_maintenance'
    EXEMPT_PATHS = (
        '/api/auth/login/',
        '/api/auth/logout/',
        '/api/auth/register/',
        '/api/auth/token/refresh/',
        '/api/auth/maintenance/',
    )
    EXEMPT_PREFIXES = (
        '/api/schema/',
        '/api/docs/',
        '/api/redoc/',
    )

    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt_auth = JWTAuthentication()

    def __call__(self, request):
        if self._should_check(request):
            data = cache.get(self.CACHE_KEY)
            end_time = int(data.get('endTime', 0)) if data else 0
            if end_time > int(time.time() * 1000):
                user = self._jwt_user(request)
                if user is not None and not user.has_min_role('STAFF'):
                    return JsonResponse(
                        {
                            'detail': (
                                'System is under maintenance. '
                                'Please try again after the maintenance window.'
                            )
                        },
                        status=503,
                    )

        return self.get_response(request)

    def _should_check(self, request):
        path = request.path_info
        if request.method == 'OPTIONS' or not path.startswith('/api/'):
            return False
        if path in self.EXEMPT_PATHS:
            return False
        return not any(path.startswith(prefix) for prefix in self.EXEMPT_PREFIXES)

    def _jwt_user(self, request):
        try:
            result = self.jwt_auth.authenticate(request)
        except (AuthenticationFailed, InvalidToken):
            return None
        if result is None:
            return None
        user, _token = result
        return user if user.is_authenticated else None
