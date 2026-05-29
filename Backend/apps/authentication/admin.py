from django.contrib import admin
from .models import User, AuditLog


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'is_active', 'is_flagged', 'date_joined')
    list_filter = ('role', 'is_active', 'is_flagged')
    search_fields = ('username', 'email', 'first_name', 'last_name')
    ordering = ('-date_joined',)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'username', 'ip_address', 'timestamp')
    list_filter = ('action',)
    search_fields = ('username', 'details')
    ordering = ('-timestamp',)
    readonly_fields = ('action', 'user', 'username', 'details', 'ip_address', 'timestamp')
