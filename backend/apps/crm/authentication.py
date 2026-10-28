"""
Autenticação do CRM: o JWT do front, conferido no login central, e a chave de API.

## JWT revalidado (TSK-1240)

Desativar a pessoa no Conecta, ou tirar dela o acesso ao CRM, derruba a sessão
já aberta. O `identidade_client.revalidar_sessao` pergunta ao Conecta no máximo
a cada 5 minutos por usuário e só devolve False com uma resposta clara de que a
identidade não vale mais aqui: Conecta fora do ar ou em manutenção nunca
derruba ninguém. A conferência fica em três pontos, os do cabeçalho do cliente:

- `JWTRevalidado`, a cada requisição: só na renovação não bastaria, porque o
  access dura 4 horas (`SIMPLE_JWT`);
- `RenovacaoRevalidada`, na renovação: o `TokenRefreshSerializer` do simplejwt
  5.3 não olha o usuário, e sem ela o front renovaria sem parar um token que a
  requisição seguinte recusa;
- `revalidar_sessao_middleware`, na sessão do Django: é a do `/admin/`, onde um
  staff desligado no Conecta continuaria pelas duas semanas do cookie, podendo
  até emitir uma chave de API para si.

A chave de API **não** passa por aqui, de propósito (TSK-1240: "não mexer na
`ApiKey`"): ela é revogada no `/admin/crm/apikey/`, e não no Conecta. Uma chave
cujo dono é uma pessoa desligada no Conecta continua valendo até ser revogada.

## Chave de API (integração externa)

Convive com o JWT: entra depois dele em DEFAULT_AUTHENTICATION_CLASSES e devolve
None quando o request não traz chave, deixando o front seguir com `Bearer`.

Aceita dois formatos, equivalentes:

    Authorization: Api-Key crm_ab12cd34_<segredo>
    X-API-Key: crm_ab12cd34_<segredo>

Em caso de sucesso, `request.user` vira o usuário vinculado à chave e
`request.auth` a própria ApiKey — é assim que HasApiScope e o throttle a enxergam.
"""
from django.contrib.auth import get_user_model, logout
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings as jwt_settings

import identidade_client
from apps.crm.models import ApiKey

#: O que o front recebe quando o login central recusa a sessão já aberta.
SESSAO_ENCERRADA = "Sessão encerrada. Entre de novo."


def revalidar_sessao_middleware(get_response):
    """Encerra a sessão do Django (a do `/admin/`) que o login central recusa.

    Logo depois do `AuthenticationMiddleware` (`MIDDLEWARE` no settings). As
    requisições do front, que vêm com `Bearer` e sem a sessão, chegam aqui como
    anônimas e passam direto: quem as confere é o `JWTRevalidado`.
    """

    def middleware(request):
        if request.user.is_authenticated and not identidade_client.revalidar_sessao(request.user):
            logout(request)
        return get_response(request)

    return middleware


class JWTRevalidado(JWTAuthentication):
    """O JWT de sempre, e a identidade conferida no Conecta (ver o topo do módulo)."""

    def get_user(self, validated_token):
        usuario = super().get_user(validated_token)
        if not identidade_client.revalidar_sessao(usuario):
            raise AuthenticationFailed(SESSAO_ENCERRADA, code="user_inactive")
        return usuario


class RenovacaoRevalidada(TokenRefreshSerializer):
    """A renovação do token só sai para a sessão que ainda vale.

    A conferência vem ANTES do `super().validate()`, que é quem monta o access
    novo. Conta apagada ou desativada aqui também não renova: o serializer do
    simplejwt 5.3 não olha nem isso.
    """

    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        usuario = (
            get_user_model()
            .objects.filter(
                **{jwt_settings.USER_ID_FIELD: refresh.get(jwt_settings.USER_ID_CLAIM)}
            )
            .first()
        )
        if (
            usuario is None
            or not usuario.is_active
            or not identidade_client.revalidar_sessao(usuario)
        ):
            raise InvalidToken(SESSAO_ENCERRADA)
        return super().validate(attrs)


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
