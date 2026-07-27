from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.crm.models import Funil
from apps.crm.permissions import HasApiScope
from apps.crm.serializers import FunilSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated, HasApiScope])
def funil_list(request):
    """Lista os funis ativos **com as suas colunas** (para o seletor e o Kanban)."""
    funis = Funil.objects.filter(ativo=True).prefetch_related("etapas__clientes")
    return Response({"results": FunilSerializer(funis, many=True).data})
