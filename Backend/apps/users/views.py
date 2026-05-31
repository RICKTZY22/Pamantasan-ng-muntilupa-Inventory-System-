from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model

from apps.authentication.serializers import UserSerializer
from apps.permissions import IsAdmin

User = get_user_model()


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

    @staticmethod
    def _is_last_active_admin(user):
        if user.role != User.Role.ADMIN or not user.is_active:
            return False
        return not User.objects.filter(
            role=User.Role.ADMIN,
            is_active=True,
        ).exclude(pk=user.pk).exists()
    
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

        if user.pk == request.user.pk and new_role != User.Role.ADMIN:
            return Response(
                {'error': 'You cannot remove your own administrator role.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if self._is_last_active_admin(user) and new_role != User.Role.ADMIN:
            return Response(
                {'error': 'At least one active administrator account is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        user.role = new_role
        user.save()
        
        return Response(UserSerializer(user).data)
    
    @action(detail=True, methods=['post'])
    def toggle_status(self, request, pk=None):
        """Activate/deactivate user."""
        user = self.get_object()

        if user.pk == request.user.pk and user.is_active:
            return Response(
                {'error': 'You cannot deactivate your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if self._is_last_active_admin(user):
            return Response(
                {'error': 'At least one active administrator account is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = not user.is_active
        user.save()
        
        return Response({
            'message': f'User {"activated" if user.is_active else "deactivated"}',
            'user': UserSerializer(user).data,
        })

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()

        if user.pk == request.user.pk:
            return Response(
                {'error': 'You cannot delete your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if self._is_last_active_admin(user):
            return Response(
                {'error': 'At least one active administrator account is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def unflag(self, request, pk=None):
        """Clear an overdue flag after an admin review.
        overdue_count is intentionally preserved as lifetime history.
        """
        user = self.get_object()
        user.is_flagged = False
        user.save(update_fields=['is_flagged'])

        return Response({
            'message': 'User flag removed.',
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
            'flagged': queryset.filter(is_flagged=True).count(),
            'byRole': {
                'students': queryset.filter(role='STUDENT').count(),
                'faculty': queryset.filter(role='FACULTY').count(),
                'staff': queryset.filter(role='STAFF').count(),
                'admin': queryset.filter(role='ADMIN').count(),
            },
        }
        
        return Response(stats)
