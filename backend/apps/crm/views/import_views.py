"""Importação de clientes via Excel (.xlsx)."""
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.crm.services.importacao import gerar_modelo_xlsx, importar_clientes

_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def importar(request):
    arquivo = request.FILES.get("arquivo")
    if not arquivo:
        return Response({"erro": "Envie o arquivo no campo 'arquivo'."}, status=status.HTTP_400_BAD_REQUEST)
    if not arquivo.name.lower().endswith(".xlsx"):
        return Response({"erro": "Envie um arquivo .xlsx."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        resultado = importar_clientes(arquivo, usuario=request.user)
    except ValueError as e:
        return Response({"erro": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(resultado)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def modelo_importacao(request):
    conteudo = gerar_modelo_xlsx()
    resp = HttpResponse(conteudo, content_type=_XLSX)
    resp["Content-Disposition"] = 'attachment; filename="modelo-importacao-clientes.xlsx"'
    return resp
