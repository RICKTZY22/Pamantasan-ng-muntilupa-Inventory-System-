from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    CustomTokenObtainPairView,
    RegisterView,
    ProfileView,
    ChangePasswordView,
    ProfilePictureView,
    BackupView,
    AuditLogView,
    MaintenanceView,
)

urlpatterns = [
    # JWT auth
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),


    path('register/', RegisterView.as_view(), name='register'),

    # Profile
    path('profile/', ProfileView.as_view(), name='profile'),
    path('profile/password/', ChangePasswordView.as_view(), name='change_password'),
    path('profile/picture/', ProfilePictureView.as_view(), name='profile_picture'),


    path('backup/', BackupView.as_view(), name='backup'),


    path('audit-logs/', AuditLogView.as_view(), name='audit_logs'),

    # System maintenance
    path('maintenance/', MaintenanceView.as_view(), name='maintenance'),
]
