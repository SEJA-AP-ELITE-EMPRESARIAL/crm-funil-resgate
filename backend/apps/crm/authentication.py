"""
Autenticação por chave de API (integração externa).

Convive com o JWT: entra depois dele em DEFAULT_AUTHENTICATION_CLASSES e devolve
None quando o request não traz chave, deixando o front seguir com `Bearer`.

Aceita dois formatos, equivalentes:

    Authorization: Api-Key crm_ab12cd34_<segredo>
    X-API-Key: crm_ab12cd34_<segredo>

Em caso de sucesso, `request.user` vira o usuário vinculado à chave e
`request.auth` a própria ApiKey — é assim que HasApiScope e o throttle a enxergam.
"""
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from apps.crm.models import ApiKey

PALAVRA_CHAVE = "Api-Key"

# Mensagem genérica para chave inexistente/errada: não confirma se o prefixo
# existe, evitando sondagem.
_INVALIDA = "Chave de API inválida."


class ApiKeyAuthentication(BaseAuthentication):
    def authenticate(self, request):
        chave = self._extrair_chave(request)
        if not chave:
            return None

        prefixo = ApiKey.extrair_prefixo(chave)
        if not prefixo:
            raise AuthenticationFailed(_INVALIDA)

        api_key = ApiKey.objects.select_related("usuario").filter(prefixo=prefixo).first()
        if api_key is None or not api_key.confere(chave):
            raise AuthenticationFailed(_INVALIDA)
        if not api_key.ativa:
            raise AuthenticationFailed("Chave de API revogada.")
        if api_key.expirada:
            raise AuthenticationFailed("Chave de API expirada.")
        if not api_key.usuario.is_active:
            raise AuthenticationFailed("Usuário vinculado à chave está inativo.")

        api_key.registrar_uso()
        return (api_key.usuario, api_key)

    def authenticate_header(self, request):
        """Header do 401 — sem isto o DRF devolveria 403 em vez de 401."""
        return PALAVRA_CHAVE

    @staticmethod
    def _extrair_chave(request) -> str | None:
        header = get_authorization_header(request).decode("latin-1")
        if header:
            partes = header.split()
            # Só reivindica o request quando o esquema é o nosso; "Bearer" é do JWT.
            if len(partes) == 2 and partes[0].lower() == PALAVRA_CHAVE.lower():
                return partes[1]
        return request.META.get("HTTP_X_API_KEY") or None
