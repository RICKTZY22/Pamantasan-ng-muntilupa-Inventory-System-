"""
WSGI config for config project.
Eto yung WSGI (Web Server Gateway Interface) configuration
Ginagamit to pag mag-deploy ka sa production server (e.g., Gunicorn, Apache)
Eto yung standard na way para i-serve yung Django app mo

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

# Sinasabi dito kung saan yung settings file ng Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

# Gumawa ng WSGI application instance - eto yung ini-serve ng production server
application = get_wsgi_application()
