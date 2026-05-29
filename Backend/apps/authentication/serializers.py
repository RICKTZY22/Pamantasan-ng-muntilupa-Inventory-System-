from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):

    fullName = serializers.SerializerMethodField()
    avatarUrl = serializers.SerializerMethodField()
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    isFlagged = serializers.BooleanField(source='is_flagged', read_only=True)
    overdueCount = serializers.IntegerField(source='overdue_count', read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'fullName',
            'role', 'department', 'student_id', 'avatar', 'avatarUrl', 'phone',
            'isActive', 'date_joined', 'last_login',
            'isFlagged', 'overdueCount',
        ]
        read_only_fields = ['id', 'date_joined', 'last_login']

    def get_fullName(self, obj) -> str:
        return obj.get_full_name() or obj.username

    def get_avatarUrl(self, obj) -> str | None:
        if not obj.avatar:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.avatar.url)
        return obj.avatar.url


class RegisterSerializer(serializers.ModelSerializer):

    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)
    fullName = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password2', 'fullName',
            'role', 'department', 'student_id',
        ]

    def validate_email(self, value):
        """Only allow @plmun.edu.ph email addresses for registration."""
        from django.conf import settings as django_settings
        allowed_domains = getattr(django_settings, 'ALLOWED_EMAIL_DOMAINS', ['plmun.edu.ph'])
        domain = value.strip().lower().split('@')[-1]
        if domain not in allowed_domains:
            raise serializers.ValidationError(
                'Registration is restricted to PLMUN email addresses (@plmun.edu.ph).'
            )
        return value.strip().lower()

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')

        full_name = validated_data.pop('fullName', '')
        name_parts = full_name.split(' ', 1)
        first_name = name_parts[0] if name_parts else ''
        last_name = name_parts[1] if len(name_parts) > 1 else ''

        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
            role=validated_data.get('role', 'STUDENT'),
            department=validated_data.get('department', ''),
            student_id=validated_data.get('student_id', ''),
        )
        return user


class ProfileUpdateSerializer(serializers.ModelSerializer):

    fullName = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'fullName', 'department', 'phone', 'avatar']

    def update(self, instance, validated_data):
        full_name = validated_data.pop('fullName', None)
        if full_name:
            name_parts = full_name.split(' ', 1)
            instance.first_name = name_parts[0] if name_parts else ''
            instance.last_name = name_parts[1] if len(name_parts) > 1 else ''

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()
        return instance


class ChangePasswordSerializer(serializers.Serializer):

    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, validators=[validate_password])

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Current password is incorrect.')
        return value

    def save(self, **kwargs):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save()

        # Invalidate all existing refresh tokens for this user (S9)
        # so stolen/leaked tokens can't be used after a password change.
        try:
            from rest_framework_simplejwt.token_blacklist.models import (
                OutstandingToken, BlacklistedToken,
            )
            tokens = OutstandingToken.objects.filter(user=user)
            for token in tokens:
                BlacklistedToken.objects.get_or_create(token=token)
        except Exception:
            pass  # token_blacklist might not be fully configured — fail silently

        return user
