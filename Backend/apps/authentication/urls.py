from django.urls import path

from .views import (
    CustomTokenObtainPairView,
    CookieTokenRefreshView,
    LogoutView,
    RegisterView,
    ProfileView,
    ChangePasswordView,
    ProfilePictureView,
    BackupView,
    AuditLogView,
    MaintenanceView,
)

urlpatterns = [
    # JWT auth — refresh token lives in an HttpOnly cookie (see views.py).
    path('login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),


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
