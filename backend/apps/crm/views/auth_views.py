"""
Autenticação e configuração pública do CRM.

- Login por e-mail OU username (o MVP loga com e-mail; o User padrão do Django
  usa username — aqui aceitamos os dois).
- /me expõe o usuário logado (o AuthContext do front consome).
- /config expõe a regra de negócio (taxa de comissão, meses padrão) para o
  front rotular a UI sem duplicar a constante.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.crm.models import EtapaFunil

User = get_user_model()


class EmailOrUsernameTokenSerializer(TokenObtainPairSerializer):
    """Permite autenticar informando e-mail no lugar do username."""

    def validate(self, attrs):
        login = attrs.get(self.username_field)
        if login and "@" in login:
            match = User.objects.filter(email__iexact=login).first()
            if match:
                attrs[self.username_field] = match.get_username()
        return super().validate(attrs)


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    return Response({
        "id": u.id,
        "username": u.get_username(),
        "email": u.email,
        "nome": (u.get_full_name() or u.get_username()),
        "is_staff": u.is_staff,
        "is_superuser": u.is_superuser,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def config(request):
    """Regra de negócio + metadados das etapas (para o front)."""
    return Response({
        "comissao_rate": float(getattr(settings, "CRM_COMISSAO_RATE", 0.03)),
        "meses_contrato_padrao": int(getattr(settings, "CRM_MESES_CONTRATO_PADRAO", 12)),
        "etapas": [{"value": v, "label": l} for v, l in EtapaFunil.choices],
    })
