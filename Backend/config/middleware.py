"""
Content-Security-Policy middleware for PLMun Nexus.

Adds a CSP header to every response to mitigate XSS, data injection,
and other code-injection attacks.

The policy is intentionally permissive for development (inline styles,
Google Fonts, blob: for image uploads) but can be tightened for production.
"""


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
