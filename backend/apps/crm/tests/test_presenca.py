"""
O sinal de presença da tela (TSK-1521): `POST /api/crm/presenca/`.

    python manage.py test apps.crm.tests.test_presenca

A tela do CRM manda um sinal por minuto, e na troca de tela, para o painel "Uso
em tempo real" do Conecta; a rota o repassa pelo
`identidade_client.enviar_presenca` (1.6.0). O que se prova aqui:

- o que a tela mandou chega ao cliente: a pessoa do JWT, o módulo, a tela e a
  última interação, e 204 mesmo com o Conecta fora do ar ou em manutenção;
- só o JWT da tela manda sinal: a chave de API (nos dois formatos) e a sessão
  do `/admin/` do Django levam 401 e nunca chegam a `enviar_presenca`, e
  nenhuma outra rota o chama;
- nada além do sinal: 400 para o corpo que não é sinal, um limite por pessoa e
  nenhum INSERT, UPDATE ou DELETE no banco do CRM.

O Conecta nunca sobe aqui: ou `enviar_presenca` é trocado por um mock, ou a
saída de rede do cliente (`_abrir`) é.
"""
import json
import os
import re
import urllib.error
import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from django.apps import apps
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

import identidade_client
from apps.crm.models import ApiKey, VinculoIdentidade
from apps.crm.models.api_key import EscopoApiKey
from apps.crm.tests.test_login_central import CENTRAL_LIGADA, IDENTIDADE

User = get_user_model()

URL = "/api/crm/presenca/"

SINAL = {
    "modulo": "Funil",
    "tela": "Kanban · Resgate",
    "ultima_interacao": "2026-11-17T14:03:12.345Z",
}
INTERACAO = datetime(2026, 11, 17, 14, 3, 12, 345000, tzinfo=timezone.utc)


def com_jwt(usuario):
    """O cliente como a tela o usa: `Authorization: Bearer <access>`."""
    cliente = APIClient()
    token = RefreshToken.for_user(usuario).access_token
    cliente.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return cliente


class BasePresenca(TestCase):
    def setUp(self):
        # O limite conta no cache: sem limpar, a ordem dos testes muda o resultado.
        cache.clear()
        self.ana = User.objects.create_user("ana", "ana@x.com", "x")
        self.bia = User.objects.create_user("bia", "bia@x.com", "x")
        enviar = patch("identidade_client.enviar_presenca", return_value=True)
        self.enviar = enviar.start()
        self.addCleanup(enviar.stop)

    def mandar(self, cliente, corpo=SINAL):
        return cliente.post(URL, corpo, format="json")


class RepasseTest(BasePresenca):
    """A rota repassa a pessoa, o módulo, a tela e a última interação."""

    def test_repassa_o_sinal_ao_cliente(self):
        resposta = self.mandar(com_jwt(self.ana))

        self.assertEqual(resposta.status_code, 204)
        self.assertEqual(resposta.content, b"")
        self.enviar.assert_called_once()
        args, kwargs = self.enviar.call_args
        self.assertEqual(args, (self.ana,))
        self.assertEqual(
            kwargs,
            {"modulo": "Funil", "tela": "Kanban · Resgate", "ultima_interacao": INTERACAO},
        )

    def test_a_pessoa_e_a_do_jwt(self):
        self.mandar(com_jwt(self.bia))

        self.assertEqual(self.enviar.call_args.args[0].pk, self.bia.pk)

    def test_so_a_tela(self):
        resposta = self.mandar(com_jwt(self.ana), {"tela": "Troca de senha"})

        self.assertEqual(resposta.status_code, 204)
        self.enviar.assert_called_once_with(
            self.ana, modulo="", tela="Troca de senha", ultima_interacao=None
        )

    def test_interacao_nula_vai_como_none(self):
        resposta = self.mandar(com_jwt(self.ana), {**SINAL, "ultima_interacao": None})

        self.assertEqual(resposta.status_code, 204)
        self.assertIsNone(self.enviar.call_args.kwargs["ultima_interacao"])

    def test_interacao_com_outro_fuso(self):
        resposta = self.mandar(
            com_jwt(self.ana), {**SINAL, "ultima_interacao": "2026-11-17T11:03:12.345-03:00"}
        )

        self.assertEqual(resposta.status_code, 204)
        self.assertEqual(self.enviar.call_args.kwargs["ultima_interacao"], INTERACAO)

    def test_204_mesmo_quando_o_cliente_devolve_false(self):
        """O False é o Conecta fora, a pausa, a conta sem vínculo: nada disso é da tela."""
        self.enviar.return_value = False

        resposta = self.mandar(com_jwt(self.ana))

        self.assertEqual(resposta.status_code, 204)


class _RespostaVazia:
    """O 204 do Conecta, como o `urllib` o entrega ao `with` do cliente."""

    def __init__(self, url):
        self.url = url

    def __enter__(self):
        return self

    def __exit__(self, *erro):
        return False

    def read(self):
        return b""


@CENTRAL_LIGADA
class ConectaDeVerdadeTest(TestCase):
    """Com o `enviar_presenca` de verdade: só a saída de rede do cliente é trocada.

    É o caminho de produção inteiro, do corpo da tela ao pedido que sairia para
    `api/v1/presenca`, com o Conecta respondendo, fora do ar ou em manutenção.
    """

    def setUp(self):
        cache.clear()
        self.ana = User.objects.create_user("ana", "ana@x.com", "x")
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)
        # O login aceito vale como revalidação: o JWT não pergunta ao Conecta
        # agora, e o único pedido que sai é o do sinal.
        identidade_client.lembrar_sessao_valida(self.ana)
        # A pausa depois de uma falha é do processo: cada teste começa sem ela.
        pausa = patch.object(identidade_client, "_PRESENCA_PAUSADA_ATE", 0.0)
        pausa.start()
        self.addCleanup(pausa.stop)
        self.cliente = com_jwt(self.ana)

    def test_o_pedido_que_sai_para_o_conecta(self):
        with patch.object(identidade_client, "_abrir") as abrir:
            abrir.side_effect = lambda pedido, timeout: _RespostaVazia(pedido.full_url)
            resposta = self.cliente.post(URL, SINAL, format="json")

        self.assertEqual(resposta.status_code, 204)
        (chamada,) = abrir.call_args_list
        pedido = chamada.args[0]
        self.assertEqual(pedido.full_url, "http://identidade-api:8000/api/v1/presenca")
        self.assertEqual(pedido.get_method(), "POST")
        # O sistema é o da chave do app (o `crm`), nunca um campo do corpo.
        self.assertEqual(pedido.get_header("Authorization"), "AppKey crm:chave-de-teste")
        corpo = json.loads(pedido.data)
        self.assertEqual(
            set(corpo), {"identidade_id", "modulo", "tela", "ultima_interacao"}
        )
        self.assertEqual(corpo["identidade_id"], IDENTIDADE)
        self.assertEqual(corpo["modulo"], "Funil")
        self.assertEqual(corpo["tela"], "Kanban · Resgate")
        self.assertEqual(datetime.fromisoformat(corpo["ultima_interacao"]), INTERACAO)
        # O timeout do sinal é o do cliente (2 s), e não os 5 s do login.
        self.assertLessEqual(chamada.args[1], identidade_client.TIMEOUT_DA_PRESENCA)

    def test_conecta_fora_do_ar_ainda_e_204(self):
        with patch.object(identidade_client, "_abrir") as abrir:
            abrir.side_effect = urllib.error.URLError("Connection refused")
            primeira = self.cliente.post(URL, SINAL, format="json")
            # Na pausa depois da falha, o sinal seguinte nem sai: ainda 204.
            segunda = self.cliente.post(URL, SINAL, format="json")

        self.assertEqual(primeira.status_code, 204)
        self.assertEqual(segunda.status_code, 204)
        self.assertEqual(abrir.call_count, 1)

    def test_conecta_em_manutencao_ainda_e_204(self):
        with patch(
            "identidade_client.ClienteIdentidade.presenca",
            side_effect=identidade_client.IdentidadeEmManutencao("503 manutencao"),
        ) as presenca:
            resposta = self.cliente.post(URL, SINAL, format="json")

        self.assertEqual(resposta.status_code, 204)
        presenca.assert_called_once_with(
            uuid.UUID(IDENTIDADE),
            modulo="Funil",
            tela="Kanban · Resgate",
            ultima_interacao=INTERACAO,
        )

    def test_conta_sem_vinculo_nao_manda_nada(self):
        """A conta local (sem identidade no Conecta) não tem o que mostrar no painel."""
        bia = User.objects.create_user("bia", "bia@x.com", "x")
        with patch.object(identidade_client, "_abrir") as abrir:
            resposta = com_jwt(bia).post(URL, SINAL, format="json")

        self.assertEqual(resposta.status_code, 204)
        abrir.assert_not_called()


class CorpoInvalidoTest(BasePresenca):
    """400 para o que não é sinal, e nada vai ao Conecta."""

    LIMITE = identidade_client.TAMANHO_DO_TEXTO_NO_SINAL
    CASOS = {
        "corpo vazio": {},
        "sem tela": {"modulo": "Funil"},
        "tela vazia": {"modulo": "Funil", "tela": "   "},
        "tela nula": {"modulo": "Funil", "tela": None},
        "tela que não é texto": {"tela": ["Kanban"]},
        "módulo nulo": {"tela": "Kanban", "modulo": None},
        "módulo que não é texto": {"tela": "Kanban", "modulo": {"funil": 1}},
        "tela longa demais": {"tela": "x" * (LIMITE + 1)},
        "módulo longo demais": {"tela": "Kanban", "modulo": "x" * (LIMITE + 1)},
        "caractere nulo": {"tela": "Kan\x00ban"},
        "interação que não é data": {"tela": "Kanban", "ultima_interacao": "ontem"},
        "interação sem fuso": {"tela": "Kanban", "ultima_interacao": "2026-11-17T14:03:12"},
        "interação impossível": {"tela": "Kanban", "ultima_interacao": "2026-13-17T14:03:12Z"},
        "interação em milissegundos": {"tela": "Kanban", "ultima_interacao": 1795442592345},
        "interação vazia": {"tela": "Kanban", "ultima_interacao": ""},
        "interação longa demais": {"tela": "Kanban", "ultima_interacao": "2" * 65},
        "lista no lugar do objeto": [SINAL],
        "texto no lugar do objeto": "Kanban",
    }

    def test_corpos_invalidos(self):
        cliente = com_jwt(self.ana)
        for nome, corpo in self.CASOS.items():
            with self.subTest(nome):
                resposta = self.mandar(cliente, corpo)
                self.assertEqual(resposta.status_code, 400)
        self.enviar.assert_not_called()

    def test_json_quebrado(self):
        resposta = com_jwt(self.ana).post(URL, data="{tela:", content_type="application/json")

        self.assertEqual(resposta.status_code, 400)
        self.enviar.assert_not_called()

    def test_texto_no_limite_passa(self):
        tela = "x" * self.LIMITE
        resposta = self.mandar(com_jwt(self.ana), {"modulo": "Funil", "tela": tela})

        self.assertEqual(resposta.status_code, 204)
        self.assertEqual(self.enviar.call_args.kwargs["tela"], tela)


class SoATelaTest(BasePresenca):
    """Só o JWT da tela manda sinal: a chave de API e a sessão do /admin/, não."""

    def chave(self, usuario, escopo=EscopoApiKey.ESCRITA):
        _, chave = ApiKey.gerar("n8n", usuario=usuario, escopo=escopo)
        return chave

    def test_sem_autenticacao_401(self):
        resposta = self.mandar(APIClient())

        self.assertEqual(resposta.status_code, 401)
        self.assertTrue(resposta.has_header("WWW-Authenticate"))
        self.enviar.assert_not_called()

    def test_chave_de_api_401_nos_dois_formatos(self):
        chave = self.chave(self.ana)
        for nome, cabecalho in (
            ("Authorization: Api-Key", {"HTTP_AUTHORIZATION": f"Api-Key {chave}"}),
            ("X-API-Key", {"HTTP_X_API_KEY": chave}),
        ):
            with self.subTest(nome):
                cliente = APIClient()
                cliente.credentials(**cabecalho)
                resposta = self.mandar(cliente)
                self.assertEqual(resposta.status_code, 401)
        self.enviar.assert_not_called()

    def test_chave_de_superusuario_tambem_401(self):
        chefe = User.objects.create_superuser("chefe", "chefe@x.com", "x")
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f"Api-Key {self.chave(chefe)}")

        self.assertEqual(self.mandar(cliente).status_code, 401)
        self.enviar.assert_not_called()

    def test_a_mesma_chave_entra_no_resto_da_api(self):
        """O 401 acima é da rota, e não de uma chave ruim."""
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION=f"Api-Key {self.chave(self.ana)}")

        resposta = cliente.get("/api/crm/me/")

        self.assertEqual(resposta.status_code, 200)
        self.assertIn("api_key", resposta.data)

    def test_uso_pela_chave_nao_manda_sinal(self):
        """Leitura e escrita pela chave, como o n8n faz: nenhum sinal sai."""
        cliente = APIClient()
        cliente.credentials(HTTP_X_API_KEY=self.chave(self.ana))

        for url in ("/api/crm/me/", "/api/crm/funis/", "/api/crm/etapas/", "/api/crm/clientes/"):
            with self.subTest(url):
                self.assertEqual(cliente.get(url).status_code, 200)
        resposta = cliente.post("/api/crm/clientes/", {"nome": "Padaria"}, format="json")
        self.assertEqual(resposta.status_code, 201)
        self.enviar.assert_not_called()

    def test_navegar_pela_tela_tambem_nao_manda_sinal(self):
        """Só o sinal manda sinal: ler o funil com o JWT não chama o cliente."""
        cliente = com_jwt(self.ana)
        for url in ("/api/crm/me/", "/api/crm/funis/", "/api/crm/clientes/"):
            self.assertEqual(cliente.get(url).status_code, 200)
        self.enviar.assert_not_called()

    def test_sessao_do_admin_401(self):
        """O /admin do Django não manda sinal: a sessão dele nem é lida aqui."""
        chefe = User.objects.create_superuser("chefe", "chefe@x.com", "x")
        cliente = Client()
        cliente.force_login(chefe)
        self.assertEqual(cliente.get("/admin/").status_code, 200)

        resposta = cliente.post(URL, SINAL, content_type="application/json")

        self.assertEqual(resposta.status_code, 401)
        self.enviar.assert_not_called()

    def test_jwt_recusado_no_conecta_401(self):
        """A pessoa desligada no Conecta não aparece online: o JWT dela já não vale."""
        with patch("identidade_client.revalidar_sessao", return_value=False):
            resposta = self.mandar(com_jwt(self.ana))

        self.assertEqual(resposta.status_code, 401)
        self.enviar.assert_not_called()

    def test_so_post(self):
        cliente = com_jwt(self.ana)
        for metodo in ("get", "put", "patch", "delete"):
            with self.subTest(metodo):
                resposta = getattr(cliente, metodo)(URL)
                self.assertEqual(resposta.status_code, 405)
        self.enviar.assert_not_called()


class UmChamadorSoTest(SimpleTestCase):
    """Só a rota da tela chama o sinal, em todo o código do backend.

    Os testes acima trocam `identidade_client.enviar_presenca` pelo nome do
    módulo: um `from identidade_client import enviar_presenca` numa integração
    (um comando, a importação de planilha) passaria por eles. Esta leitura do
    código fecha essa porta.
    """

    CHAMADA = re.compile(r"enviar_presenca|\.presenca\s*\(")

    def test_so_a_rota_da_tela_chama_o_sinal(self):
        backend = Path(settings.BASE_DIR)
        rota = backend / "apps" / "crm" / "views" / "presenca_views.py"
        testes = backend / "apps" / "crm" / "tests"
        arquivos = [
            *(backend / "apps").rglob("*.py"),
            *(backend / "config").rglob("*.py"),
            *backend.glob("*.py"),
        ]
        self.assertIn(rota, arquivos)
        permitidos = {rota, backend / "identidade_client.py"}
        achados = [
            str(a.relative_to(backend))
            for a in arquivos
            if a not in permitidos
            and testes not in a.parents
            and self.CHAMADA.search(a.read_text(encoding="utf-8"))
        ]
        self.assertEqual(achados, [])


class LimiteTest(BasePresenca):
    """O limite é por pessoa (`CRM_PRESENCA_RATE`, 20/min em produção)."""

    def test_vinte_por_minuto_por_padrao(self):
        # O settings lê o .env: quem roda a suíte com a variável definida não
        # está testando o padrão.
        if os.environ.get("CRM_PRESENCA_RATE"):
            self.skipTest("CRM_PRESENCA_RATE definido no ambiente")
        self.assertEqual(settings.CRM_PRESENCA_RATE, "20/min")

    @override_settings(CRM_PRESENCA_RATE="2/min")
    def test_limite_por_pessoa(self):
        cliente = com_jwt(self.ana)
        self.assertEqual(self.mandar(cliente).status_code, 204)
        self.assertEqual(self.mandar(cliente).status_code, 204)
        self.assertEqual(self.mandar(cliente).status_code, 429)
        # Outra pessoa tem a cota dela.
        self.assertEqual(self.mandar(com_jwt(self.bia)).status_code, 204)
        self.assertEqual(self.enviar.call_count, 3)


@CENTRAL_LIGADA
class SemNadaGravadoTest(TestCase):
    """Nada de presença no banco do CRM: o sinal não escreve nada (sem histórico)."""

    def setUp(self):
        cache.clear()
        self.ana = User.objects.create_user("ana", "ana@x.com", "x")
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)
        identidade_client.lembrar_sessao_valida(self.ana)
        pausa = patch.object(identidade_client, "_PRESENCA_PAUSADA_ATE", 0.0)
        pausa.start()
        self.addCleanup(pausa.stop)

    def test_o_sinal_nao_escreve_no_banco(self):
        """O caminho inteiro (JWT, cota, corpo, cliente de verdade até a rede), só leitura."""
        cliente = com_jwt(self.ana)
        with patch.object(identidade_client, "_abrir") as abrir:
            abrir.side_effect = lambda pedido, timeout: _RespostaVazia(pedido.full_url)
            with CaptureQueriesContext(connection) as consultas:
                resposta = cliente.post(URL, SINAL, format="json")

        self.assertEqual(resposta.status_code, 204)
        self.assertEqual(abrir.call_count, 1)
        self.assertTrue(consultas.captured_queries)
        escritas = [
            c["sql"]
            for c in consultas.captured_queries
            if c["sql"].lstrip().split(" ", 1)[0].upper() in ("INSERT", "UPDATE", "DELETE")
        ]
        self.assertEqual(escritas, [])

    def test_nenhum_model_de_presenca(self):
        """O estado de agora fica no Conecta (decisão de 16/11/2026)."""
        nomes = {modelo.__name__.lower() for modelo in apps.get_models()}
        self.assertFalse({nome for nome in nomes if "presenc" in nome})
