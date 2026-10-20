"""
POST /api/crm/diagnostico/erro-de-teste/ — dispara uma exceção de propósito (TSK-1147).

Serve para conferir, depois de um deploy, que o erro chega ao GlitchTip
(projeto `crm`) com o release igual ao commit da imagem: a rota termina em 500
e o SDK manda o evento. Sem SENTRY_DSN, só devolve o 500.

Só superusuário, e só com o JWT do login (`Authorization: Bearer ...`): chave de
API não serve, nem a de um superusuário, porque integração não tem o que
diagnosticar aqui. Qualquer outra conta leva 403 sem a exceção acontecer, para
que ninguém mais consiga encher o GlitchTip. POST, e não GET, para um link ou um
<img> não dispararem a rota por engano. Dez por hora por usuário (a cota mora no
cache local de cada worker do gunicorn). Coberto em
`apps/crm/tests/test_glitchtip.py`.
"""
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework_simplejwt.authentication import JWTAuthentication


class ErroDeTesteDoGlitchTip(RuntimeError):
    """A exceção da rota. O nome próprio facilita achar a issue no GlitchTip."""


class SoSuperusuario(BasePermission):
    message = "Apenas superusuário."

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class LimiteDoErroDeTeste(UserRateThrottle):
    # A permissão vem antes da cota no DRF: só o superusuário consome a dele.
    scope = "erro_de_teste_glitchtip"
    rate = "10/hour"


@api_view(["POST"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated, SoSuperusuario])
@throttle_classes([LimiteDoErroDeTeste])
def erro_de_teste(request):
    raise ErroDeTesteDoGlitchTip(
        "Erro de teste do GlitchTip (TSK-1147), disparado por superusuário."
    )
