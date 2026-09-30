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

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings
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
    ESQUECI = "/api/crm/senha/esqueci/"

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

    # --- pedir o link (esqueci minha senha) -------------------------------
    @patch("identidade_client.ClienteIdentidade.esqueci_senha")
    def test_esqueci_senha_e_publico_e_so_pede_o_link(self, pedir):
        """Sem autenticar, e sem tocar em senha: só dispara o e-mail."""
        hash_antes = User.objects.get(pk=self.ana.pk).password

        r = self.client.post(self.ESQUECI, {"email": self.ana.email}, format="json")

        self.assertEqual(r.status_code, 200, r.data)
        pedir.assert_called_once_with(self.ana.email)
        self.assertEqual(User.objects.get(pk=self.ana.pk).password, hash_antes)

    @patch("identidade_client.ClienteIdentidade.esqueci_senha")
    def test_endereco_desconhecido_responde_exatamente_igual(self, pedir):
        """A rota é pública: diferença aqui entrega quem trabalha na empresa."""
        conhecido = self.client.post(
            self.ESQUECI, {"email": self.ana.email}, format="json"
        )
        estranho = self.client.post(
            self.ESQUECI, {"email": "ninguem-desse-mundo@sejaap.com.br"}, format="json"
        )

        self.assertEqual(conhecido.status_code, estranho.status_code)
        self.assertEqual(conhecido.data, estranho.data)

    @patch("identidade_client.ClienteIdentidade.esqueci_senha")
    def test_esqueci_senha_com_servico_fora_do_ar_vira_503(self, pedir):
        pedir.side_effect = IdentidadeIndisponivel("fora do ar")
        r = self.client.post(self.ESQUECI, {"email": self.ana.email}, format="json")
        self.assertEqual(r.status_code, 503)

    def test_o_crm_nao_redefine_mais_senha_sem_token(self):
        """A rota que fazia isso saiu do ar no Conecta ID em 28/08/2026.

        O método sumiu do cliente junto; este teste é a rede para o dia em que
        alguém recopiar uma versão antiga do `identidade_client.py`.
        """
        from identidade_client import ClienteIdentidade

        self.assertFalse(hasattr(ClienteIdentidade, "redefinir_sem_token"))


# === O IP que chega ao Conecta ID =========================================
# A cadeia que um visitante mal-intencionado produz. Da esquerda para a
# direita: `10.9.8.7` é o que ele mesmo escreveu no X-Forwarded-For (podia ser
# o IP do escritório); `200.1.1.1` é o que a Cloudflare acrescentou, o IP de
# verdade; `172.64.0.1` é a borda da Cloudflare vista pelo nginx do host; e
# `172.18.0.1` é o nginx do host visto pelo nginx do front. Cada camada
# ACRESCENTA — nenhuma apaga o que veio antes.
CADEIA_FORJADA = "10.9.8.7, 200.1.1.1, 172.64.0.1, 172.18.0.1"
IP_REAL = "200.1.1.1"

# A cadeia de produção tem três proxies de confiança. O `override` repete o
# número em vez de ler o settings porque o que estes testes provam é o
# COMPORTAMENTO com três; que produção diga três é o teste logo abaixo.
TRES_PROXIES = override_settings(
    REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 3},
    IDENTIDADE_NUM_PROXIES=3,
)


class NumeroDeProxiesTest(TestCase):
    """Trava a configuração real, sem override nenhum.

    O teste de cima prova que três proxies dão o IP certo; este prova que é
    três o que o app diz ter. Sem ele, mexer no settings passaria calado e o
    bloqueio por IP do Conecta ID voltaria a trancar o escritório.
    """

    def test_o_crm_declara_tres_proxies(self):
        # Cloudflare -> nginx do host -> nginx do front -> gunicorn.
        self.assertEqual(settings.REST_FRAMEWORK["NUM_PROXIES"], 3)

    def test_o_cliente_de_identidade_usa_o_mesmo_numero_do_drf(self):
        """Um número, dois leitores. Divergir aqui é o CRM contar de dois jeitos."""
        self.assertEqual(
            settings.IDENTIDADE_NUM_PROXIES, settings.REST_FRAMEWORK["NUM_PROXIES"]
        )


@CENTRAL_LIGADA
@TRES_PROXIES
class IpParaOConectaIdTest(BaseLogin):
    """O IP que vai ao Conecta ID é o que a Cloudflare viu.

    O bloqueio por origem do Conecta ID é global: 20 erros em 15 min trancam o
    IP por 30 min em TODOS os apps. Enquanto o CRM mandava o primeiro item do
    X-Forwarded-For, dois estragos conviviam — trancar o escritório alheio de
    fora, e escapar da própria contagem trocando o cabeçalho a cada tentativa.
    """

    TROCAR = "/api/crm/senha/"

    def setUp(self):
        super().setUp()
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_login_manda_o_ip_real_e_nao_o_forjado(self, verificar):
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")

        self.client.post(
            TOKEN,
            {"email": self.ana.email, "password": "chute"},
            format="json",
            HTTP_X_FORWARDED_FOR=CADEIA_FORJADA,
            REMOTE_ADDR="172.18.0.5",
        )

        self.assertEqual(verificar.call_args.kwargs["ip"], IP_REAL)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_login_pelo_django_admin_manda_o_mesmo_ip(self, verificar):
        """O /admin/ não passa pelo DRF, e mesmo assim conta para o bloqueio.

        Ele chama o `authenticate` do Django com o request, como o login do
        front — e é o mesmo `BackendIdentidade` que responde. O teste existe
        porque essa porta é fácil de esquecer: nenhuma linha do CRM a trata.
        """
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")

        Client().post(
            "/admin/login/",
            {"username": self.ana.email, "password": "chute"},
            HTTP_X_FORWARDED_FOR=CADEIA_FORJADA,
            REMOTE_ADDR="172.18.0.5",
        )

        self.assertEqual(verificar.call_args.kwargs["ip"], IP_REAL)

    @patch("identidade_client.ClienteIdentidade.trocar_senha")
    def test_troca_de_senha_manda_o_ip_real(self, trocar):
        self.client.force_authenticate(user=self.ana)

        r = self.client.post(
            self.TROCAR,
            {"senha_atual": SENHA, "nova_senha": "outra-senha-bem-longa-987"},
            format="json",
            HTTP_X_FORWARDED_FOR=CADEIA_FORJADA,
            REMOTE_ADDR="172.18.0.5",
        )

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(trocar.call_args.kwargs["ip"], IP_REAL)


@CENTRAL_LIGADA
@override_settings(
    REST_FRAMEWORK={**settings.REST_FRAMEWORK, "NUM_PROXIES": 0},
    IDENTIDADE_NUM_PROXIES=0,
)
class SemProxyNenhumTest(BaseLogin):
    """Com zero proxies o X-Forwarded-For é lixo, e o cliente o ignora.

    Não é um cenário do CRM em produção — é a prova de que o número manda. Se
    um dia alguém tirar o nginx do front da frente, `NUM_PROXIES` vira 2 e a
    conta anda junto; o que não pode é o cabeçalho valer por si.
    """

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_o_cabecalho_e_ignorado_e_vale_o_remote_addr(self, verificar):
        verificar.side_effect = CredencialInvalida("Credenciais inválidas.")

        self.client.post(
            TOKEN,
            {"email": self.ana.email, "password": "chute"},
            format="json",
            HTTP_X_FORWARDED_FOR=CADEIA_FORJADA,
            REMOTE_ADDR="172.18.0.5",
        )

        self.assertEqual(verificar.call_args.kwargs["ip"], "172.18.0.5")
