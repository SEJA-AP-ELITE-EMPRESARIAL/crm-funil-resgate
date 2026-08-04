"""
Autenticação e configuração pública do CRM.

- Login **só por e-mail**, verificado no Conecta ID (ver `LoginPorEmailSerializer`).
- /me expõe o usuário logado (o AuthContext do front consome).
- /config expõe a regra de negócio (taxa de comissão, meses padrão) para o
  front rotular a UI sem duplicar a constante.
"""
import logging

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import update_last_login
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.crm.models import ApiKey

User = get_user_model()
logger = logging.getLogger(__name__)


class LoginPorEmailSerializer(TokenObtainPairSerializer):
    """Login por e-mail, verificado no Conecta ID.

    Substituiu um `EmailOrUsernameTokenSerializer` que reescrevia e-mail →
    username ANTES do `authenticate()`. Com o login local aquilo funcionava; com
    o login central, nao: o servico identifica a pessoa por e-mail (`por_email`
    filtra um EmailField), entao um username nunca casa la. O
    `BackendIdentidade` devolveria `None` para toda conta que ja existisse aqui,
    o `ModelBackend` logo atras aceitaria a senha local, e o login central nao
    valeria para ninguem — sem erro nenhum aparecendo.

    Desde 04/08/2026 nao ha mais para onde cair: o `ModelBackend` saiu da cadeia
    junto com as senhas locais. Uma tentativa, um backend, um caminho.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # O pai declara o campo `username`. Trocamos por `email` para o formato
        # ser recusado no serializer, e não virar uma consulta que nunca casa.
        self.fields.pop(self.username_field, None)
        self.fields["email"] = serializers.EmailField()

    def validate(self, attrs):
        email = attrs["email"].strip().lower()
        senha = attrs["password"]

        # Uma tentativa, um backend. O laco que existia aqui — e-mail primeiro,
        # username depois — servia para alcancar o `ModelBackend`, e ele saiu
        # junto com as senhas locais. `BloqueadoTemporariamente` e
        # `IdentidadeIndisponivel` sobem daqui de proposito: a view as traduz em
        # 429 e 503, e servico fora do ar nao pode parecer senha errada.
        self.user = authenticate(
            request=self.context.get("request"), username=email, password=senha
        )

        if not api_settings.USER_AUTHENTICATION_RULE(self.user):
            raise AuthenticationFailed(
                self.error_messages["no_active_account"], "no_active_account"
            )

        # O par de tokens é montado aqui, e não com `super().validate()`, porque
        # o `validate` do pai refaz o `authenticate()` — com o campo `username`,
        # que já não existe. São quatro linhas copiadas; a alternativa seria
        # autenticar duas vezes por login, e a segunda com o valor errado.
        refresh = self.get_token(self.user)
        dados = {"refresh": str(refresh), "access": str(refresh.access_token)}
        if api_settings.UPDATE_LAST_LOGIN:
            update_last_login(None, self.user)
        return dados


class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = LoginPorEmailSerializer

    def post(self, request, *args, **kwargs):
        """Distingue "senha errada" de "não deu para verificar".

        Nenhum dos dois pode virar 401. Se o Conecta ID cai e todo mundo vê
        "credenciais inválidas" ao mesmo tempo, a leitura natural é vazamento de
        senha — e vem uma enxurrada de trocas que não resolve nada, com o
        suporte procurando o problema no lugar errado.
        """
        from identidade_client import BloqueadoTemporariamente, IdentidadeIndisponivel

        try:
            return super().post(request, *args, **kwargs)
        except BloqueadoTemporariamente as erro:
            return Response({"detail": str(erro)}, status=429)
        except IdentidadeIndisponivel as erro:
            logger.error("login indisponível: %s", erro)
            return Response(
                {
                    "detail": (
                        "Não foi possível verificar suas credenciais agora. "
                        "Tente novamente em instantes."
                    )
                },
                status=503,
            )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    u = request.user
    dados = {
        "id": u.id,
        "username": u.get_username(),
        "email": u.email,
        "nome": (u.get_full_name() or u.get_username()),
        "is_staff": u.is_staff,
        "is_superuser": u.is_superuser,
        # Decidido no Conecta ID e copiado para o vínculo a cada login. False
        # para quem não tem vínculo: quem entra local não tem o que trocar lá.
        "precisa_trocar_senha": bool(
            getattr(getattr(u, "vinculo_identidade", None), "precisa_trocar_senha", False)
        ),
    }
    # Autenticado por chave de API: devolve qual chave e com que escopo —
    # é o endpoint que uma integração usa para conferir se a credencial funciona.
    api_key = getattr(request, "auth", None)
    if isinstance(api_key, ApiKey):
        dados["api_key"] = {
            "nome": api_key.nome,
            "prefixo": api_key.prefixo,
            "escopo": api_key.escopo,
            "expira_em": api_key.expira_em,
        }
    return Response(dados)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def trocar_senha(request):
    """POST /api/crm/senha/ — a pessoa troca a **própria** senha.

    Body: `{"senha_atual": "...", "nova_senha": "..."}`.

    Só existe no modo central. Sem vínculo, a senha continua sendo a local e
    quem a troca é o `/admin/` do Django — que é como o CRM sempre funcionou.
    Aceitar aqui e gravar `set_password` daria à pessoa a impressão de ter
    trocado algo que o login seguinte ignoraria.
    """
    from apps.crm import identidade_senha

    if not identidade_senha.usa_central(request.user):
        return Response(
            {
                "detail": (
                    "Esta conta ainda não usa o login central. "
                    "Peça a troca a um administrador."
                )
            },
            status=409,
        )

    atual = request.data.get("senha_atual") or ""
    nova = request.data.get("nova_senha") or ""
    if not atual or not nova:
        return Response({"detail": "Informe 'senha_atual' e 'nova_senha'."}, status=400)
    if atual == nova:
        return Response(
            {"nova_senha": "A nova senha precisa ser diferente da atual."}, status=400
        )

    try:
        identidade_senha.trocar(
            request.user, atual, nova, ip=identidade_senha.ip_do_request(request)
        )
    except identidade_senha.CredencialInvalida:
        return Response({"senha_atual": "Senha atual incorreta."}, status=400)
    except identidade_senha.SenhaFraca as erro:
        return Response({"nova_senha": str(erro)}, status=400)
    except identidade_senha.IdentidadeIndisponivel:
        return Response(
            {"detail": "Não foi possível trocar a senha agora. Tente em instantes."},
            status=503,
        )
    # Limpa a marca AGORA. O Conecta ID já zerou o `forcar_troca_senha` dele,
    # mas a cópia local só é atualizada no login — e é ela que o /me devolve.
    # Sem isto, quem acabou de trocar a senha continuaria preso na tela de troca
    # obrigatória até sair e entrar de novo.
    from apps.crm.models import VinculoIdentidade

    VinculoIdentidade.objects.filter(usuario=request.user).update(
        precisa_trocar_senha=False
    )
    return Response({"detail": "Senha alterada."})


@api_view(["POST"])
@permission_classes([AllowAny])
def definir_senha(request):
    """POST /api/crm/senha/definir/ — consome o link gerado no kanban.

    Público de propósito: é o caminho de quem **não consegue entrar**. A prova é
    o token de uso único, e quem o valida é o Conecta ID.

    Mensagem de erro deliberadamente genérica: distinguir "token nunca existiu"
    de "token já usado" entregaria a um estranho um oráculo sobre links que ele
    não emitiu.
    """
    from apps.crm import identidade_senha

    token = (request.data.get("token") or "").strip()
    nova = request.data.get("nova_senha") or ""
    if not token or not nova:
        return Response({"detail": "Informe 'token' e 'nova_senha'."}, status=400)

    try:
        identidade_senha.definir_por_token(token, nova)
    except identidade_senha.TokenInvalido:
        return Response(
            {"detail": "Link inválido ou expirado. Peça um novo a um administrador."},
            status=400,
        )
    except identidade_senha.SenhaFraca as erro:
        return Response({"nova_senha": str(erro)}, status=400)
    except identidade_senha.IdentidadeIndisponivel:
        return Response(
            {"detail": "Não foi possível definir a senha agora. Tente em instantes."},
            status=503,
        )
    return Response({"detail": "Senha definida. Você já pode entrar."})


@api_view(["GET"])
@permission_classes([AllowAny])
def config(request):
    """Regra de negócio global.

    As etapas saíram daqui: deixaram de ser uma lista global e passaram a
    pertencer a cada funil — venha buscá-las em `/api/crm/funis/` (embutidas em
    cada funil) ou em `/api/crm/etapas/?funil=<id|slug>`.
    """
    return Response({
        "comissao_rate": float(getattr(settings, "CRM_COMISSAO_RATE", 0.03)),
        "meses_contrato_padrao": int(getattr(settings, "CRM_MESES_CONTRATO_PADRAO", 12)),
    })
