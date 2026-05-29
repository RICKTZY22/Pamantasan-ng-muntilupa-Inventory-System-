from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model

from apps.authentication.serializers import UserSerializer

User = get_user_model()


class IsAdmin(permissions.BasePermission):
    """Allow access to Admin only."""
    
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_admin


class UserViewSet(viewsets.ModelViewSet):
    """Admin-only ViewSet for user management."""
    
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    
    def get_queryset(self): # type: ignore
        """Filter and search users."""
        queryset = User.objects.all()
        
        search = self.request.query_params.get('search', '') # type: ignore
        role = self.request.query_params.get('role', '') # type: ignore
        is_active = self.request.query_params.get('is_active', '') # type: ignore
        
        if search:
            queryset = queryset.filter(
                first_name__icontains=search
            ) | queryset.filter(
                last_name__icontains=search
            ) | queryset.filter(
                email__icontains=search
            )
        
        if role:
            queryset = queryset.filter(role=role)
        
        if is_active:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        
        return queryset
    
    @action(detail=True, methods=['put', 'patch'])
    def role(self, request, pk=None):
        """Change user role."""
        user = self.get_object()
        new_role = request.data.get('role')
        
        if new_role not in User.Role.values:
            return Response(
                {'error': f'Invalid role. Must be one of: {list(User.Role.values)}'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        user.role = new_role
        user.save()
        
        return Response(UserSerializer(user).data)
    
    @action(detail=True, methods=['post'])
    def toggle_status(self, request, pk=None):
        """Activate/deactivate user."""
        user = self.get_object()
        user.is_active = not user.is_active
        user.save()
        
        return Response({
            'message': f'User {"activated" if user.is_active else "deactivated"}',
            'user': UserSerializer(user).data,
        })
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get user statistics."""
        queryset = User.objects.all()
        
        stats = {
            'total': queryset.count(),
            'active': queryset.filter(is_active=True).count(),
            'inactive': queryset.filter(is_active=False).count(),
            'byRole': {
                'students': queryset.filter(role='STUDENT').count(),
                'faculty': queryset.filter(role='FACULTY').count(),
                'staff': queryset.filter(role='STAFF').count(),
                'admin': queryset.filter(role='ADMIN').count(),
            },
        }
        
        return Response(stats)
