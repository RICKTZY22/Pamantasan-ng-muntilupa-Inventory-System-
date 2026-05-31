from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AssistantConversationView, AssistantMessageView, ConversationViewSet

router = DefaultRouter()
router.register(r'conversations', ConversationViewSet, basename='conversation')

urlpatterns = [
    path('assistant/conversation/', AssistantConversationView.as_view(), name='assistant-conversation'),
    path('assistant/messages/', AssistantMessageView.as_view(), name='assistant-messages'),
    path('', include(router.urls)),
]
