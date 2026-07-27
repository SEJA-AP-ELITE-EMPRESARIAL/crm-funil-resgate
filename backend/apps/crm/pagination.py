"""
Paginação opt-in.

A lista de clientes sempre devolveu a base inteira em `{"results": [...]}` e o
front conta com isso (o Kanban precisa de tudo para montar as colunas). Manter
a compatibilidade e ainda assim dar uma saída para consumidores externos:
a paginação só entra quando o request pede (`?page=` ou `?page_size=`), e a
resposta paginada mantém a chave `results`.
"""
from rest_framework.pagination import PageNumberPagination


class ClientePagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = "page_size"
    max_page_size = 500


def paginacao_solicitada(request) -> bool:
    return "page" in request.query_params or "page_size" in request.query_params
