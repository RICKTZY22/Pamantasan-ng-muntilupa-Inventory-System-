from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from django.db.models import Count, Q

from apps.authentication.serializers import UserSerializer
from apps.permissions import IsAdmin

User = get_user_model()


class UserViewSet(viewsets.ModelViewSet):
    """Admin-only ViewSet for user management."""
    
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]
    
    def create(self, request, *args, **kwargs):
        """User creation goes through /api/auth/register/ (which validates and
        hashes a password). The default ModelViewSet create would make a
        passwordless, unusable account, so it's disabled here (finding #27)."""
        return Response(
            {'detail': 'Create users via /api/auth/register/.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def get_queryset(self):
        """Filter and search users."""
        queryset = User.objects.all()
        
        search = self.request.query_params.get('search', '')
        role = self.request.query_params.get('role', '')
        is_active = self.request.query_params.get('is_active', '')
        
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

        # Role counts stay grouped so this endpoint does not run one query per role.
        role_counts = dict(
            queryset.values('role').annotate(count=Count('id')).values_list('role', 'count')
        )

        # Overall totals are one aggregate query.
        totals = queryset.aggregate(
            total=Count('id'),
            active=Count('id', filter=Q(is_active=True)),
            inactive=Count('id', filter=Q(is_active=False)),
            flagged=Count('id', filter=Q(is_flagged=True)),
        )

        return Response({
            **totals,
            'byRole': {
                'students': role_counts.get(User.Role.STUDENT, 0),
                'faculty': role_counts.get(User.Role.FACULTY, 0),
                'staff': role_counts.get(User.Role.STAFF, 0),
                'admin': role_counts.get(User.Role.ADMIN, 0),
            },
        })
