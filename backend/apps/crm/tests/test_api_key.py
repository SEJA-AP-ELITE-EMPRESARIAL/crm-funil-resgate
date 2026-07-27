"""
Testes da API de integração externa (chave de API).

    python manage.py test apps.crm.tests.test_api_key

Cobrem: autenticação pelos dois headers, chave inválida/revogada/expirada,
escopo de leitura barrando escrita, rate limit por chave, paginação opt-in e
a garantia de que o segredo não fica em texto no banco.
"""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.crm.models import ApiKey, Cliente, EscopoApiKey, Funil
from apps.crm.throttling import ApiKeyRateThrottle

User = get_user_model()


class ApiKeyModelTests(TestCase):
    def setUp(self):
        self.integracao = User.objects.create_user("integracao", "int@x.com", "senha12345")

    def test_segredo_nao_fica_no_banco(self):
        api_key, chave = ApiKey.gerar("n8n", self.integracao)
        api_key.refresh_from_db()
        self.assertNotIn(chave, api_key.hash_chave)
        self.assertEqual(len(api_key.hash_chave), 64)
        self.assertTrue(chave.startswith(f"crm_{api_key.prefixo}_"))

    def test_confere_so_aceita_a_chave_certa(self):
        api_key, chave = ApiKey.gerar("n8n", self.integracao)
        self.assertTrue(api_key.confere(chave))
        self.assertFalse(api_key.confere(chave + "x"))

    def test_extrair_prefixo_rejeita_formato_invalido(self):
        self.assertIsNone(ApiKey.extrair_prefixo("sem-formato"))
        self.assertIsNone(ApiKey.extrair_prefixo("outro_abc12345_segredo"))
        self.assertEqual(ApiKey.extrair_prefixo("crm_abc12345_segredo"), "abc12345")


class ApiKeyAuthTests(TestCase):
    def setUp(self):
        cache.clear()
        self.integracao = User.objects.create_user("integracao", "int@x.com", "senha12345")
        self.leitura, self.chave_leitura = ApiKey.gerar("n8n leitura", self.integracao)
        self.escrita, self.chave_escrita = ApiKey.gerar(
            "n8n escrita", self.integracao, escopo=EscopoApiKey.ESCRITA
        )
        self.apn = Funil.objects.get(slug="indicados_apn")
        self.client = APIClient()

    def _com_chave(self, chave):
        return {"HTTP_AUTHORIZATION": f"Api-Key {chave}"}

    def test_leitura_autentica_pelo_authorization(self):
        Cliente.objects.create(nome="Empresa API")
        resp = self.client.get("/api/crm/clientes/", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Empresa API", [c["nome"] for c in resp.data["results"]])

    def test_leitura_autentica_pelo_x_api_key(self):
        resp = self.client.get("/api/crm/funis/", HTTP_X_API_KEY=self.chave_leitura)
        self.assertEqual(resp.status_code, 200)

    def test_sem_chave_continua_401(self):
        resp = self.client.get("/api/crm/clientes/")
        self.assertEqual(resp.status_code, 401)

    def test_chave_invalida(self):
        resp = self.client.get("/api/crm/clientes/", **self._com_chave("crm_abcdefgh_naoexiste"))
        self.assertEqual(resp.status_code, 401)

    def test_chave_revogada(self):
        self.leitura.ativa = False
        self.leitura.save()
        resp = self.client.get("/api/crm/clientes/", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.status_code, 401)
        self.assertIn("revogada", str(resp.data["detail"]))

    def test_chave_expirada(self):
        self.leitura.expira_em = timezone.now() - timedelta(minutes=1)
        self.leitura.save()
        resp = self.client.get("/api/crm/clientes/", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.status_code, 401)
        self.assertIn("expirada", str(resp.data["detail"]))

    def test_usuario_inativo_invalida_a_chave(self):
        self.integracao.is_active = False
        self.integracao.save()
        resp = self.client.get("/api/crm/clientes/", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.status_code, 401)

    def test_escopo_leitura_barra_escrita(self):
        resp = self.client.post(
            "/api/crm/clientes/", {"nome": "Bloqueada"}, **self._com_chave(self.chave_leitura)
        )
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(Cliente.objects.filter(nome="Bloqueada").exists())

    def test_escopo_leitura_barra_delete(self):
        c = Cliente.objects.create(nome="Intocável")
        resp = self.client.delete(f"/api/crm/clientes/{c.id}/", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.status_code, 403)
        self.assertTrue(Cliente.objects.filter(pk=c.pk).exists())

    def test_escopo_escrita_cria_e_atualiza(self):
        resp = self.client.post(
            "/api/crm/clientes/",
            {"funil": self.apn.id, "nome": "Via integração", "etapa": "priorizado"},
            **self._com_chave(self.chave_escrita),
        )
        self.assertEqual(resp.status_code, 201)
        # `criado_por` é o usuário vinculado à chave.
        self.assertEqual(resp.data["criado_por"], self.integracao.id)

        cliente_id = resp.data["id"]
        resp = self.client.patch(
            f"/api/crm/clientes/{cliente_id}/",
            {"etapa": "em_conversa"},
            **self._com_chave(self.chave_escrita),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["etapa_slug"], "em_conversa")

    def test_me_identifica_a_chave(self):
        resp = self.client.get("/api/crm/me/", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["api_key"]["prefixo"], self.leitura.prefixo)
        self.assertEqual(resp.data["api_key"]["escopo"], EscopoApiKey.LEITURA)

    def test_uso_e_registrado(self):
        self.assertIsNone(self.leitura.ultimo_uso_em)
        self.client.get("/api/crm/clientes/", **self._com_chave(self.chave_leitura))
        self.leitura.refresh_from_db()
        self.assertIsNotNone(self.leitura.ultimo_uso_em)

    def test_paginacao_opt_in(self):
        for i in range(5):
            Cliente.objects.create(nome=f"Empresa {i}")

        # Sem parâmetro: base inteira, formato antigo (o front depende disto).
        resp = self.client.get("/api/crm/clientes/", **self._com_chave(self.chave_leitura))
        self.assertEqual(len(resp.data["results"]), 5)
        self.assertNotIn("count", resp.data)

        # Com parâmetro: paginado, mantendo a chave `results`.
        resp = self.client.get("/api/crm/clientes/?page=1&page_size=2", **self._com_chave(self.chave_leitura))
        self.assertEqual(resp.data["count"], 5)
        self.assertEqual(len(resp.data["results"]), 2)
        self.assertIsNotNone(resp.data["next"])

    def test_jwt_do_front_continua_funcionando(self):
        """A chave de API entrou sem tirar o JWT do caminho."""
        self.client.force_authenticate(user=self.integracao)
        resp = self.client.post("/api/crm/clientes/", {"nome": "Pelo front"})
        self.assertEqual(resp.status_code, 201)


class ApiKeyThrottleTests(TestCase):
    """A taxa é fixada na própria classe do throttle: `@api_view` congela
    `throttle_classes` no import, então override_settings não teria efeito."""

    def setUp(self):
        cache.clear()
        self.usuario = User.objects.create_user("integracao", "int@x.com", "senha12345")
        self.api_key, self.chave = ApiKey.gerar("n8n", self.usuario)
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_estoura_a_cota_por_chave(self):
        cabecalhos = {"HTTP_AUTHORIZATION": f"Api-Key {self.chave}"}
        with patch.object(ApiKeyRateThrottle, "THROTTLE_RATES", {"api_key": "3/min"}):
            for _ in range(3):
                self.assertEqual(self.client.get("/api/crm/funis/", **cabecalhos).status_code, 200)
            self.assertEqual(self.client.get("/api/crm/funis/", **cabecalhos).status_code, 429)

    def test_jwt_do_front_nao_e_limitado(self):
        self.client.force_authenticate(user=self.usuario)
        with patch.object(ApiKeyRateThrottle, "THROTTLE_RATES", {"api_key": "3/min"}):
            for _ in range(6):
                self.assertEqual(self.client.get("/api/crm/funis/").status_code, 200)
