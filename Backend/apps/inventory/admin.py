from django.contrib import admin
from .models import Item


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'quantity', 'status', 'access_level', 'is_returnable')
    list_filter = ('category', 'status', 'access_level', 'is_returnable')
    search_fields = ('name', 'description', 'location')
    ordering = ('-created_at',)
