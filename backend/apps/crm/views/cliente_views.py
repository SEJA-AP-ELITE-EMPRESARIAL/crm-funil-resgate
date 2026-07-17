"""
Views do cliente (function-based, dispatcher por método — padrão ConectaAP).

Autenticação JWT + IsAuthenticated. Base compartilhada: sem filtro por dono.
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.crm.serializers import ClienteSerializer, ClienteWriteSerializer
from apps.crm.services import ClienteService

from ._helpers import clientes_base


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def cliente_root(request):
    if request.method == "POST":
        return _criar(request)
    return _listar(request)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def cliente_item(request, cliente_id: int):
    cliente = get_object_or_404(clientes_base(), pk=cliente_id)
    if request.method == "DELETE":
        ClienteService.remover(cliente)
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method in ("PUT", "PATCH"):
        return _atualizar(request, cliente)
    return Response(ClienteSerializer(cliente).data)


# === handlers internos ===
def _listar(request):
    clientes = clientes_base()
    # Filtro opcional por funil (id ou slug); o front usa client-side, mas
    # o parâmetro fica disponível para consumidores diretos da API.
    funil = request.query_params.get("funil")
    if funil and funil != "all":
        if funil.isdigit():
            clientes = clientes.filter(funil_id=int(funil))
        else:
            clientes = clientes.filter(funil__slug=funil)
    return Response({"results": ClienteSerializer(clientes, many=True).data})


def _criar(request):
    serializer = ClienteWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    cliente = ClienteService.criar(serializer.validated_data, usuario=request.user)
    return Response(ClienteSerializer(cliente).data, status=status.HTTP_201_CREATED)


def _atualizar(request, cliente):
    parcial = request.method == "PATCH"
    serializer = ClienteWriteSerializer(cliente, data=request.data, partial=parcial)
    serializer.is_valid(raise_exception=True)
    cliente = ClienteService.atualizar(cliente, serializer.validated_data)
    return Response(ClienteSerializer(cliente).data)
