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
    """Com `AUTH_CENTRAL_ATIVO=False` ninguém entra. A flag deixou de reverter.

    Esta classe existia para provar o contrário: que desligar a chave devolvia o
    login local intacto. Isso acabou em 04/08/2026, com o expurgo das senhas
    locais e a saída do `ModelBackend`.

    O teste continua aqui, invertido, porque a promessa antiga ("é só desligar a
    flag") vai sobreviver na cabeça de quem leu o código antes — e o dia de
    descobrir que ela não vale mais não pode ser o dia do incidente.
    """

    @override_settings(AUTH_CENTRAL_ATIVO=False)
    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_desligar_a_chave_nao_devolve_o_login_local(self, verificar):
        resposta = self.entrar(self.ana.email)

        self.assertEqual(resposta.status_code, 401)
        # E nem chega a perguntar ao serviço: o backend sai da frente sozinho.
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
    def test_senha_local_correta_nao_entra_mais(self, verificar):
        """O `ModelBackend` saiu: não existe segundo caminho.

        A Ana tem senha local válida no banco de teste — é por isso que o teste
        vale. Enquanto havia fallback, esta mesma chamada entrava.
        """
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")

        resposta = self.entrar(self.ana.email)

        self.assertEqual(resposta.status_code, 401)
        # Uma tentativa, não duas: não há mais username para tentar depois.
        self.assertEqual(verificar.call_count, 1)


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
    def test_quem_nao_migrou_tambem_nao_entra(self, verificar):
        """A rede de segurança da transição foi recolhida junto com o expurgo.

        Antes, quem não tinha vínculo seguia entrando pela senha local. Hoje não
        há para onde cair: sem identidade no Conecta ID, não há login.
        """
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")
        bruno = User.objects.create_user("bruno", "bruno@x.com", SENHA)
        resposta = self.entrar(bruno.email)
        self.assertEqual(resposta.status_code, 401)

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


@CENTRAL_LIGADA
class SenhaPeloConectaIdTest(BaseLogin):
    """Trocar e definir senha quando ela mora no serviço central.

    O erro que estes testes impedem é o mais traiçoeiro da migração:
    `set_password` local continua funcionando e continua devolvendo 200 depois
    do corte — só que não muda nada, porque quem responde no login seguinte é o
    Conecta ID.
    """

    TROCAR = "/api/crm/senha/"
    DEFINIR = "/api/crm/senha/definir/"

    def setUp(self):
        super().setUp()
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)

    @patch("identidade_client.ClienteIdentidade.trocar_senha")
    def test_troca_vai_para_o_conecta_id_e_nao_toca_na_senha_local(self, trocar):
        hash_antes = User.objects.get(pk=self.ana.pk).password
        self.client.force_authenticate(user=self.ana)

        r = self.client.post(
            self.TROCAR,
            {"senha_atual": SENHA, "nova_senha": "outra-senha-bem-longa-987"},
            format="json",
        )

        self.assertEqual(r.status_code, 200, r.data)
        trocar.assert_called_once()
        self.assertEqual(trocar.call_args.args[0], IDENTIDADE)
        self.assertEqual(User.objects.get(pk=self.ana.pk).password, hash_antes)

    @patch("identidade_client.ClienteIdentidade.trocar_senha")
    def test_troca_limpa_a_marca_de_troca_obrigatoria_na_hora(self, trocar):
        """Sem isto o PrivateRoute devolve a pessoa para a tela que ela cumpriu.

        O Conecta ID zera o `forcar_troca_senha` dele, mas a cópia local só é
        atualizada no LOGIN — e é ela que o /me devolve, que é o que o guard do
        front lê.
        """
        VinculoIdentidade.objects.filter(usuario=self.ana).update(
            precisa_trocar_senha=True
        )
        self.client.force_authenticate(user=self.ana)

        r = self.client.post(
            self.TROCAR,
            {"senha_atual": SENHA, "nova_senha": "outra-senha-bem-longa-987"},
            format="json",
        )

        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(
            VinculoIdentidade.objects.get(usuario=self.ana).precisa_trocar_senha
        )
        self.assertFalse(self.client.get("/api/crm/me/").data["precisa_trocar_senha"])

    @patch("identidade_client.ClienteIdentidade.trocar_senha")
    def test_senha_atual_errada_volta_no_campo_certo(self, trocar):
        trocar.side_effect = CredencialInvalida("Credenciais inválidas.")
        self.client.force_authenticate(user=self.ana)
        r = self.client.post(
            self.TROCAR,
            {"senha_atual": "chute", "nova_senha": "outra-senha-bem-longa-987"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn("senha_atual", r.data)

    @patch("identidade_client.ClienteIdentidade.trocar_senha")
    def test_quem_nao_migrou_recebe_409_em_vez_de_troca_que_nao_vale(self, trocar):
        """Sem vínculo, a senha é a local — e o CRM não a troca por aqui.

        Aceitar e gravar `set_password` daria à pessoa a impressão de ter
        trocado algo que o login seguinte ignoraria.
        """
        bruno = User.objects.create_user("bruno", "bruno@x.com", SENHA)
        self.client.force_authenticate(user=bruno)
        r = self.client.post(
            self.TROCAR,
            {"senha_atual": SENHA, "nova_senha": "outra-senha-bem-longa-987"},
            format="json",
        )
        self.assertEqual(r.status_code, 409)
        trocar.assert_not_called()

    @patch("identidade_client.ClienteIdentidade.definir_senha")
    def test_definir_por_token_e_publico(self, definir):
        """Sem autenticar: é justamente o caminho de quem não consegue entrar."""
        r = self.client.post(
            self.DEFINIR,
            {"token": "tok-123", "nova_senha": "senha-nova-bem-longa-321"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.data)
        definir.assert_called_once_with("tok-123", "senha-nova-bem-longa-321")

    @patch("identidade_client.ClienteIdentidade.definir_senha")
    def test_token_invalido_nao_diz_o_motivo(self, definir):
        from identidade_client import TokenInvalido

        definir.side_effect = TokenInvalido("token ja consumido em 03/08 as 14h")
        r = self.client.post(
            self.DEFINIR,
            {"token": "tok-velho", "nova_senha": "senha-nova-bem-longa-321"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.assertNotIn("consumido", str(r.data).lower())

    @patch("identidade_client.ClienteIdentidade.definir_senha")
    def test_servico_fora_do_ar_vira_503(self, definir):
        definir.side_effect = IdentidadeIndisponivel("fora do ar")
        r = self.client.post(
            self.DEFINIR,
            {"token": "tok-123", "nova_senha": "senha-nova-bem-longa-321"},
            format="json",
        )
        self.assertEqual(r.status_code, 503)
