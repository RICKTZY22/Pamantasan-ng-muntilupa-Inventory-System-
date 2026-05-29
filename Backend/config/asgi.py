"""
ASGI config for config project.
Eto yung ASGI (Asynchronous Server Gateway Interface) configuration
Ginagamit to pag mag-deploy ka ng Django na may async support (e.g., WebSockets, real-time features)

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

# Sinasabi dito kung saan yung settings file ng Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Gumawa ng ASGI application instance - eto yung ini-serve ng ASGI server (e.g., Daphne, Uvicorn)
application = get_asgi_application()
