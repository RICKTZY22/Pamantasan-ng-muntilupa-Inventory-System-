from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import RequestViewSet, NotificationViewSet

router = DefaultRouter()
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'', RequestViewSet, basename='request')

urlpatterns = [
    path('', include(router.urls)),
]

