"""
Views dos funis (quadros) — CRUD.

Function-based com dispatcher por método, no mesmo padrão de etapa_views.
Criar funil deixou de ser operação só do /admin em 2026-08-20 (TSK-146).
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.crm.models import Funil
from apps.crm.permissions import HasApiScope
from apps.crm.serializers import FunilSerializer, FunilWriteSerializer
from apps.crm.services.funil_service import FunilEmUso, FunilService


def _base():
    return Funil.objects.prefetch_related("etapas__clientes")


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, HasApiScope])
def funil_root(request):
    if request.method == "POST":
        return _criar(request)
    return _listar(request)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, HasApiScope])
def funil_item(request, funil_id: int):
    funil = get_object_or_404(_base(), pk=funil_id)
    if request.method == "DELETE":
        try:
            FunilService.remover(funil)
        except FunilEmUso as exc:
            return Response({"erro": str(exc)}, status=status.HTTP_409_CONFLICT)
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method in ("PUT", "PATCH"):
        return _atualizar(request, funil)
    return Response(FunilSerializer(funil).data)


# === handlers internos ===
def _listar(request):
    """Funis **com as suas colunas** (para o seletor e o Kanban).

    Por padrão só os ativos, que é o que o board precisa. `?ativo=0` traz os
    desativados e `?ativo=todos` traz os dois — usados pela tela de gestão de
    funis, a única que precisa enxergar o que está fora do seletor.
    """
    funis = _base()
    ativo = (request.query_params.get("ativo") or "1").strip().lower()
    if ativo in {"0", "false", "nao", "não"}:
        funis = funis.filter(ativo=False)
    elif ativo not in {"todos", "all"}:
        # Valor desconhecido cai no padrão (ativos) em vez de devolver tudo: o
        # board é o consumidor principal, e nele funil desativado não entra.
        funis = funis.filter(ativo=True)
    return Response({"results": FunilSerializer(funis, many=True).data})


def _criar(request):
    serializer = FunilWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    funil = FunilService.criar(serializer.validated_data)
    return Response(FunilSerializer(funil).data, status=status.HTTP_201_CREATED)


def _atualizar(request, funil):
    parcial = request.method == "PATCH"
    serializer = FunilWriteSerializer(funil, data=request.data, partial=parcial)
    serializer.is_valid(raise_exception=True)
    funil = FunilService.atualizar(funil, serializer.validated_data)
    return Response(FunilSerializer(funil).data)
