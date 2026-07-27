"""Permissões do CRM — escopo das chaves de API."""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.crm.models import ApiKey, EscopoApiKey


class HasApiScope(BasePermission):
    """Exige escopo de escrita para métodos que alteram dados.

    Só age sobre requisições autenticadas por chave de API — sessão JWT do
    usuário passa direto (o controle ali é o do próprio usuário).
    """

    message = "Esta chave de API é somente leitura."

    def has_permission(self, request, view) -> bool:
        api_key = getattr(request, "auth", None)
        if not isinstance(api_key, ApiKey):
            return True
        if request.method in SAFE_METHODS:
            return True
        return api_key.escopo == EscopoApiKey.ESCRITA
