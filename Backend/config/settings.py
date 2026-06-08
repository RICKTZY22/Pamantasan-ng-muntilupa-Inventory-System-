"""
Django settings for PLMun Nexus.
na-reference sa official docs: https://docs.djangoproject.com/en/6.0/ref/settings/
"""

from pathlib import Path
from datetime import timedelta
import os
import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file from the Backend root directory
load_dotenv(BASE_DIR / '.env')

DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# SECURITY: no insecure fallback in production; dev fallback only when DEBUG=True
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-dev-key-change-in-production' if DEBUG else None,
)


if not SECRET_KEY:
    raise ValueError('SECRET_KEY environment variable is required in production (DEBUG=False).')

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
    if host.strip()
]


# ===== Installed Apps =====
INSTALLED_APPS = [
    # Must precede django.contrib.staticfiles so its runserver ASGI override applies
    'daphne',

    # Built-in Django apps
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third party apps
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
    'django_ratelimit',
    'channels',

    # Local apps
    'apps.authentication',
    'apps.inventory',
    'apps.requests',
    'apps.users',
    'apps.messaging',
]

# ===== Middleware =====
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'config.middleware.CSPMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'config.middleware.MaintenanceModeMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

# ===== Templates =====
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'


# ===== Database =====
# Uses DATABASE_URL env var (PostgreSQL on production), falls back to SQLite for dev
DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}'
    )
}


# ===== Custom User Model =====
AUTH_USER_MODEL = 'authentication.User'


# ===== Password Validation =====
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ===== REST Framework =====
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    # Logs unhandled 5xx with a traceback and returns a clean JSON 500.
    'EXCEPTION_HANDLER': 'apps.common.drf.exception_handler',
}


# ===== JWT Settings =====
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(hours=1),  # 1h session (matches access)
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ===== Refresh-token cookie =====
# The refresh token is delivered in an HttpOnly cookie (not the JSON body), so
# JS — and therefore any XSS — can never read it. The short-lived access token
# stays in the SPA's memory. Path-scoped to the auth endpoints so it's not sent
# on every API call. Secure only over HTTPS (prod); SameSite=Lax works because
# the SPA and API are same-site in dev (ports don't affect SameSite).
# NOTE: if frontend and API are deployed on *different* sites in production,
# set REFRESH_COOKIE_SAMESITE='None' (requires HTTPS) and add a CSRF token to
# the refresh endpoint.
REFRESH_COOKIE_NAME = 'refresh_token'
REFRESH_COOKIE_PATH = '/api/auth/'
REFRESH_COOKIE_SAMESITE = os.environ.get('REFRESH_COOKIE_SAMESITE', 'Lax')
REFRESH_COOKIE_SECURE = not DEBUG
REFRESH_COOKIE_MAX_AGE = int(SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds())


# ===== CORS Settings =====
_cors_env = os.environ.get('CORS_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
] + [origin.strip() for origin in _cors_env.split(',') if origin.strip()]
CORS_ALLOW_CREDENTIALS = True

# Same list for CSRF-protected endpoints/admin pages.
_csrf_env = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
] + [origin.strip() for origin in _csrf_env.split(',') if origin.strip()]

# Development convenience: the Vite dev server auto-bumps its port (5173 → 5174…)
# when one is busy, which otherwise breaks CORS/CSRF. In DEBUG, accept any
# localhost / 127.0.0.1 port. Production stays restricted to the configured list.
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [
        r'^http://localhost:\d+$',
        r'^http://127\.0\.0\.1:\d+$',
    ]
    _dev_origins = [
        f'{host}:{port}'
        for host in ('http://localhost', 'http://127.0.0.1')
        for port in range(5173, 5181)
    ]
    CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(CSRF_TRUSTED_ORIGINS + _dev_origins))

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

if not DEBUG:
    CSP_POLICY = {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
    }


# ===== API Documentation =====
SPECTACULAR_SETTINGS = {
    'TITLE': 'PLMun Nexus API',
    'DESCRIPTION': 'Inventory Management System API',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}


# ===== Internationalization =====
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Manila'
USE_I18N = True
USE_TZ = True


# ===== Static Files =====
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# ===== Media Files =====
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Upload / request-body size caps (defense-in-depth). Image uploads are also
# validated to <=5 MB (apps/common/images.py); these cap the raw request body and
# field count so a malformed/huge POST can't exhaust memory (finding N6).
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024   # 10 MB non-file POST body
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024    # 5 MB before streaming to a temp file
DATA_UPLOAD_MAX_NUMBER_FIELDS = 2000

# Cache (required by django-ratelimit)
_redis_url = os.environ.get('REDIS_URL')
if _redis_url:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': _redis_url,
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'plmun-ratelimit',
        }
    }
RATELIMIT_USE_CACHE = 'default'

# ===== Channels (WebSockets) =====
# Redis channel layer in production (set REDIS_URL); in-memory for local dev so
# the chat runs without Redis. NOTE: the in-memory layer is single-process only
# — production must use Redis + multiple ASGI workers to scale.
if _redis_url:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [_redis_url]},
        }
    }
else:
    CHANNEL_LAYERS = {
        'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}
    }

# LocMemCache works fine for development; silence the ratelimit warnings
SILENCED_SYSTEM_CHECKS = ['django_ratelimit.W001', 'django_ratelimit.E003']

# ===== Messages Assistant =====
# Backend-only config. Never expose keys to the frontend.
# Provider switch: 'gemini' (cloud, used in production) or 'ollama' (local LLM
# for development). Defaults to 'gemini' so production/CI behaviour is unchanged;
# set ASSISTANT_PROVIDER=ollama in your local .env to develop offline.
ASSISTANT_PROVIDER = os.environ.get('ASSISTANT_PROVIDER', 'gemini').strip().lower()

# Gemini (cloud)
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

# Ollama (local) — used when ASSISTANT_PROVIDER=ollama. No API key required.
# Default model targets a ~6 GB-VRAM GPU (e.g. RTX 4050 laptop): a 7B Q4 model
# is the sweet spot for responsive replies. num_ctx caps the prompt window so
# the KV cache also fits in VRAM.
OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
OLLAMA_ALLOWED_HOSTS = [
    host.strip().lower()
    for host in os.environ.get('OLLAMA_ALLOWED_HOSTS', 'localhost,127.0.0.1,::1').split(',')
    if host.strip()
]
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'qwen2.5:7b-instruct')
OLLAMA_NUM_CTX = int(os.environ.get('OLLAMA_NUM_CTX', '4096'))
# Hard cap (seconds) on the assistant HTTP call so a hung model can't tie up a worker.
OLLAMA_TIMEOUT = int(os.environ.get('OLLAMA_TIMEOUT', '30'))


# ===== Logging =====
# Console logging so failures and the channels/daphne lifecycle are visible.
# Without this, unhandled errors were silent — which made the earlier server
# crash hard to diagnose. INFO in dev, WARNING in production.
_LOG_LEVEL = 'INFO' if DEBUG else 'WARNING'
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {'format': '[{asctime}] {levelname} {name}: {message}', 'style': '{'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'standard'},
    },
    'root': {'handlers': ['console'], 'level': 'WARNING'},
    'loggers': {
        'django': {'handlers': ['console'], 'level': _LOG_LEVEL, 'propagate': False},
        # 500s / request errors always logged, even in production.
        'django.request': {'handlers': ['console'], 'level': 'ERROR', 'propagate': False},
        'daphne': {'handlers': ['console'], 'level': _LOG_LEVEL, 'propagate': False},
        'channels': {'handlers': ['console'], 'level': _LOG_LEVEL, 'propagate': False},
        # Our own apps (consumers, drf handler, etc.).
        'apps': {'handlers': ['console'], 'level': _LOG_LEVEL, 'propagate': False},
    },
}


# ===== XSS Defense-in-Depth Headers =====
# These headers act as a safety net protecting the JWT in localStorage
# in case a future code change introduces an XSS surface.

# Prevent browsers from MIME-sniffing a response away from the declared type
SECURE_CONTENT_TYPE_NOSNIFF = True

# Block page from being embedded in an iframe (clickjacking protection)
X_FRAME_OPTIONS = 'DENY'

# Tell browsers to block reflected XSS attacks
SECURE_BROWSER_XSS_FILTER = True

# Referrer policy — don't leak full URLs to external sites
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

# ===== Session & CSRF cookie hardening =====
# HttpOnly: cookies are not readable from JS (mitigates theft via any XSS).
# SameSite=Lax: cookies aren't sent on cross-site requests (CSRF defense-in-depth).
# The Secure flag is added in the production HTTPS block below.
# NOTE: the REST API authenticates with JWT bearer tokens in the Authorization
# header (not cookies), so CSRF is structurally N/A to those endpoints —
# CsrfViewMiddleware + these flags protect the session-cookie surface
# (Django admin and any session-authenticated views).
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Lax'

# Production-only HTTPS enforcement
if not DEBUG:
    # Render handles SSL at the proxy level — if we enable SSL redirect,
    # it causes an infinite loop. CI also uses plain HTTP test requests.
    IS_RENDER = 'RENDER' in os.environ
    IS_CI = os.environ.get('CI', '').lower() == 'true'
    SECURE_SSL_REDIRECT = (
        os.environ.get('SECURE_SSL_REDIRECT', 'False' if (IS_RENDER or IS_CI) else 'True')
        == 'True'
    )
    # trust the proxy's forwarded proto header on Render
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_HSTS_SECONDS = 31536000      # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# Auto-add Render hostname to ALLOWED_HOSTS
_render_host = os.environ.get('RENDER_EXTERNAL_HOSTNAME')
if _render_host and _render_host not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append(_render_host)

