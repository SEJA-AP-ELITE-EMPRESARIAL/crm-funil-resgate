"""
Login pelo Conecta ID (apps/crm/models/identidade.py + LoginPorEmailSerializer).

    python manage.py test apps.crm.tests.test_login_central

Cobre o que não dá para conferir olhando: a ORDEM em que os identificadores vão
para o `authenticate()`, o que acontece quando o serviço de identidade responde
errado, e o que sobra de poder para a senha local depois que alguém migra.

O Conecta ID nunca sobe aqui — `ClienteIdentidade.verificar` é substituído. O
contrato dele está testado no próprio repositório do serviço; o que interessa
neste lado é como o CRM REAGE a cada resposta possível.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.crm.models import VinculoIdentidade
from identidade_client import (
    BloqueadoTemporariamente,
    CredencialInvalida,
    IdentidadeIndisponivel,
    SemAcessoAoApp,
)

User = get_user_model()

TOKEN = "/api/token/"
SENHA = "senha12345"
IDENTIDADE = "11111111-1111-4111-8111-111111111111"

CENTRAL_LIGADA = override_settings(
    AUTH_CENTRAL_ATIVO=True,
    IDENTIDADE_URL="http://identidade-api:8000",
    IDENTIDADE_APP_KEY="AppKey crm:chave-de-teste",
)


def resposta_do_servico(usuario, identidade_id=IDENTIDADE, precisa_trocar=False):
    """O corpo que o Conecta ID devolve quando a credencial confere."""
    return {
        "identidade_id": identidade_id,
        "email": usuario.email,
        "nome": usuario.get_full_name() or usuario.get_username(),
        "precisa_trocar_senha": precisa_trocar,
    }


class BaseLogin(TestCase):
    def setUp(self):
        self.ana = User.objects.create_user("ana", "ana@x.com", SENHA)
        self.client = APIClient()

    def entrar(self, email, senha=SENHA):
        return self.client.post(TOKEN, {"email": email, "password": senha}, format="json")


class ChaveDesligadaTest(BaseLogin):
    """Com `AUTH_CENTRAL_ATIVO=False` nada muda — nem uma chamada sai daqui."""

    @override_settings(AUTH_CENTRAL_ATIVO=False)
    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_login_local_continua_funcionando(self, verificar):
        resposta = self.entrar(self.ana.email)
        self.assertEqual(resposta.status_code, 200)
        self.assertIn("access", resposta.data)
        verificar.assert_not_called()

    @override_settings(AUTH_CENTRAL_ATIVO=False)
    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_vinculo_nao_tranca_ninguem_com_a_chave_desligada(self, verificar):
        """A guarda respeita a chave.

        `vincular_identidades` roda ANTES do corte. Se o vínculo sozinho já
        barrasse a senha local, vincular deixaria de ser inofensivo e passaria a
        ser o próprio corte — sem ninguém ter decidido isso.
        """
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)
        resposta = self.entrar(self.ana.email)
        self.assertEqual(resposta.status_code, 200)
        verificar.assert_not_called()


@CENTRAL_LIGADA
class SomenteEmailTest(BaseLogin):
    """O login é por e-mail. O username não é credencial — nem como alternativa."""

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_username_nao_e_aceito(self, verificar):
        """Este teste é a trava do requisito.

        Era exatamente o caminho que o `EmailOrUsernameTokenSerializer` antigo
        abria: username entrava, e entrava por fora do Conecta ID.
        """
        verificar.return_value = resposta_do_servico(self.ana)

        resposta = self.entrar("ana")

        self.assertEqual(resposta.status_code, 400)
        self.assertIn("email", resposta.data)
        verificar.assert_not_called()

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_email_vai_primeiro_para_o_servico(self, verificar):
        verificar.return_value = resposta_do_servico(self.ana)

        resposta = self.entrar(self.ana.email.upper())

        self.assertEqual(resposta.status_code, 200)
        # Normalizado: o Conecta ID guarda o e-mail em minúsculas.
        self.assertEqual(verificar.call_args_list[0].args[0], self.ana.email)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_username_local_ainda_alcanca_o_modelbackend(self, verificar):
        """A tradução e-mail → username acontece aqui dentro, não na tela.

        Sem ela o `ModelBackend` ficaria inalcançável, e com ele iriam junto o
        superusuário do /admin/ e todo mundo que ainda não migrou.
        """
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")

        resposta = self.entrar(self.ana.email)

        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(verificar.call_args_list[0].args[0], self.ana.email)


@CENTRAL_LIGADA
class RespostasDoServicoTest(BaseLogin):
    """Cada erro do Conecta ID tem um status próprio. Nenhum vira 401."""

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_bloqueio_vira_429(self, verificar):
        verificar.side_effect = BloqueadoTemporariamente("Tente mais tarde.")
        resposta = self.entrar(self.ana.email)
        self.assertEqual(resposta.status_code, 429)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_servico_fora_do_ar_vira_503(self, verificar):
        verificar.side_effect = IdentidadeIndisponivel("Serviço inalcançável.")

        resposta = self.entrar(self.ana.email)

        self.assertEqual(resposta.status_code, 503)
        # E o 503 não pode virar "senha incorreta": se o serviço cai e todo
        # mundo vê credencial inválida ao mesmo tempo, a leitura é vazamento.
        self.assertNotIn("senha", str(resposta.data).lower())

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_servico_fora_do_ar_nao_deixa_entrar_pela_senha_local(self, verificar):
        verificar.side_effect = IdentidadeIndisponivel("Serviço inalcançável.")
        resposta = self.entrar(self.ana.email)
        self.assertEqual(resposta.status_code, 503)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_sem_acesso_ao_app_nao_revela_o_motivo(self, verificar):
        verificar.side_effect = SemAcessoAoApp("Sem acesso.")
        resposta = self.entrar("ninguem@x.com")
        self.assertEqual(resposta.status_code, 401)


@CENTRAL_LIGADA
class SenhaLocalDepoisDoVinculoTest(BaseLogin):
    """Migrou, entra só pelo Conecta ID. É o que faz revogar acesso significar algo."""

    def setUp(self):
        super().setUp()
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_acesso_revogado_nao_entra_pela_senha_local(self, verificar):
        verificar.side_effect = SemAcessoAoApp("Sem acesso.")

        resposta = self.entrar(self.ana.email)

        # A senha local da Ana continua válida no banco: é por isso que o teste
        # existe. Sem a guarda, o ModelBackend a aceitaria e a revogação feita
        # no Conecta ID não teria efeito nenhum.
        self.assertEqual(resposta.status_code, 401)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_quem_nao_migrou_ainda_entra_pela_senha_local(self, verificar):
        """A rede de segurança da transição continua de pé para quem falta."""
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")
        bruno = User.objects.create_user("bruno", "bruno@x.com", SENHA)
        resposta = self.entrar(bruno.email)
        self.assertEqual(resposta.status_code, 200)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_pelo_conecta_id_entra_normalmente(self, verificar):
        verificar.return_value = resposta_do_servico(self.ana)
        resposta = self.entrar(self.ana.email)
        self.assertEqual(resposta.status_code, 200)


@CENTRAL_LIGADA
class ResolucaoDoUsuarioTest(BaseLogin):
    """`resolver_usuario`: quem a pessoa vira dentro do CRM."""

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_conta_existente_e_casada_por_email(self, verificar):
        verificar.return_value = resposta_do_servico(self.ana)

        self.assertEqual(self.entrar(self.ana.email).status_code, 200)

        # O vínculo nasce no primeiro login, sem ninguém pedir.
        self.assertTrue(
            VinculoIdentidade.objects.filter(
                usuario=self.ana, identidade_id=IDENTIDADE
            ).exists()
        )

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_conta_nova_nasce_sem_staff(self, verificar):
        """Quem tem acesso no Conecta ID mas nunca entrou aqui vira conta local.

        Sem `is_staff` nem `is_superuser`: o CRM não tem hierarquia de papéis, e
        o que existe para errar aqui é dar admin do Django a quem só precisava
        ver o funil.
        """
        verificar.return_value = {
            "identidade_id": "22222222-2222-4222-8222-222222222222",
            "email": "novata@x.com",
            "nome": "Novata da Silva",
            "precisa_trocar_senha": False,
        }

        self.assertEqual(self.entrar("novata@x.com").status_code, 200)

        nova = User.objects.get(email="novata@x.com")
        self.assertFalse(nova.is_staff)
        self.assertFalse(nova.is_superuser)
        self.assertTrue(nova.is_active)
        self.assertEqual(nova.first_name, "Novata")
        self.assertEqual(nova.last_name, "da Silva")
        # Sem senha local: quem entra por aqui entra pelo Conecta ID, e só.
        self.assertFalse(nova.has_usable_password())

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_vinculo_vence_o_email_quando_o_email_muda(self, verificar):
        """Corrigir um e-mail não pode criar uma conta órfã.

        O UUID não muda; o e-mail muda (casamento, correção de digitação). Casar
        por e-mail primeiro faria a correção virar conta nova, com o histórico da
        pessoa preso na antiga.
        """
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)
        dados = resposta_do_servico(self.ana)
        dados["email"] = "ana.nova@x.com"
        verificar.return_value = dados

        self.assertEqual(self.entrar("ana.nova@x.com").status_code, 200)

        self.ana.refresh_from_db()
        self.assertEqual(self.ana.email, "ana.nova@x.com")
        self.assertEqual(User.objects.filter(email="ana.nova@x.com").count(), 1)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_precisa_trocar_senha_chega_no_me(self, verificar):
        verificar.return_value = resposta_do_servico(self.ana, precisa_trocar=True)

        acesso = self.entrar(self.ana.email).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {acesso}")
        resposta = self.client.get("/api/crm/me/")

        self.assertTrue(resposta.data["precisa_trocar_senha"])

    def test_sem_vinculo_o_campo_e_falso(self):
        self.client.force_authenticate(user=self.ana)
        self.assertFalse(self.client.get("/api/crm/me/").data["precisa_trocar_senha"])
