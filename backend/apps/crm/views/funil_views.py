from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.crm.models import Funil
from apps.crm.serializers import FunilSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def funil_list(request):
    """Lista os funis ativos (para o seletor global)."""
    funis = Funil.objects.filter(ativo=True)
    return Response({"results": FunilSerializer(funis, many=True).data})
