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

# SECURITY: defaults to False — sa .env lang natin i-set True for local
# nag-crash na 'to one time nung na-deploy ko na naka-True pa haha
DEBUG = os.environ.get('DEBUG', 'False') == 'True'

# SECURITY: no insecure fallback in production; dev fallback only when DEBUG=True
SECRET_KEY = os.environ.get(
    'SECRET_KEY',
    'django-insecure-dev-key-change-in-production' if DEBUG else None,
)


if not SECRET_KEY:
    raise ValueError('SECRET_KEY environment variable is required in production (DEBUG=False).')

ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')


# ===== Installed Apps =====
INSTALLED_APPS = [
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

    # Local apps
    'apps.authentication',
    'apps.inventory',
    'apps.requests',
    'apps.users',
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
}


# ===== JWT Settings =====
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),  # binawasan from 7 days
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# ===== CORS Settings =====
# whitelist lang - lagay ng production URLs sa CORS_ORIGINS env var (comma-separated)
_cors_env = os.environ.get('CORS_ORIGINS', '')
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
] + [origin.strip() for origin in _cors_env.split(',') if origin.strip()]
CORS_ALLOW_CREDENTIALS = True
# tinanggal yung CORS_ALLOW_ALL_ORIGINS = DEBUG, whitelist na lang talaga
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

# Cache (required by django-ratelimit)
# gamitin Redis sa production (set REDIS_URL env var), LocMemCache for dev lang
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

# LocMemCache works fine for development; silence the ratelimit warnings
SILENCED_SYSTEM_CHECKS = ['django_ratelimit.W001', 'django_ratelimit.E003']


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

# Production-only HTTPS enforcement
if not DEBUG:
    # Render handles SSL at the proxy level — if we enable SSL redirect,
    # it causes an infinite loop. Only enable for non-Render deployments.
    IS_RENDER = 'RENDER' in os.environ
    if not IS_RENDER:
        SECURE_SSL_REDIRECT = True
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

