from django.contrib import admin
from .models import Request, Comment, Notification


@admin.register(Request)
class RequestAdmin(admin.ModelAdmin):
    list_display = ('item_name', 'requested_by', 'status', 'priority', 'request_date')
    list_filter = ('status', 'priority')
    search_fields = ('item_name', 'purpose')
    ordering = ('-created_at',)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('request', 'author', 'created_at')
    ordering = ('-created_at',)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'type', 'is_read', 'created_at')
    list_filter = ('type', 'is_read')
    ordering = ('-created_at',)
