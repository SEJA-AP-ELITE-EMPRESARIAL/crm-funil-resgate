"""
Views das etapas (colunas do Kanban) — CRUD por funil.

Function-based com dispatcher por método, no mesmo padrão de cliente_views.
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.crm.models import Etapa
from apps.crm.permissions import HasApiScope
from apps.crm.serializers import EtapaSerializer, EtapaWriteSerializer
from apps.crm.services.etapa_service import EtapaEmUso, EtapaService


def _base():
    return Etapa.objects.select_related("funil")


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, HasApiScope])
def etapa_root(request):
    if request.method == "POST":
        return _criar(request)
    return _listar(request)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, HasApiScope])
def etapa_item(request, etapa_id: int):
    etapa = get_object_or_404(_base(), pk=etapa_id)
    if request.method == "DELETE":
        try:
            EtapaService.remover(etapa)
        except EtapaEmUso as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method in ("PUT", "PATCH"):
        return _atualizar(request, etapa)
    return Response(EtapaSerializer(etapa).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated, HasApiScope])
def etapa_reordenar(request):
    """`{"funil": 1, "ordem": [3, 1, 2]}` — aplica a nova ordem das colunas."""
    funil_id = request.data.get("funil")
    ordem = request.data.get("ordem")
    if not funil_id or not isinstance(ordem, list):
        return Response(
            {"erro": "Envie 'funil' (id) e 'ordem' (lista de ids das etapas)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    etapas = EtapaService.reordenar(int(funil_id), ordem)
    return Response({"results": EtapaSerializer(etapas, many=True).data})


# === handlers internos ===
def _listar(request):
    etapas = _base()
    funil = request.query_params.get("funil")
    if funil:
        if str(funil).isdigit():
            etapas = etapas.filter(funil_id=int(funil))
        else:
            etapas = etapas.filter(funil__slug=funil)
    return Response({"results": EtapaSerializer(etapas, many=True).data})


def _criar(request):
    serializer = EtapaWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    etapa = EtapaService.criar(serializer.validated_data)
    return Response(EtapaSerializer(etapa).data, status=status.HTTP_201_CREATED)


def _atualizar(request, etapa):
    parcial = request.method == "PATCH"
    serializer = EtapaWriteSerializer(etapa, data=request.data, partial=parcial)
    serializer.is_valid(raise_exception=True)
    etapa = EtapaService.atualizar(etapa, serializer.validated_data)
    return Response(EtapaSerializer(etapa).data)
