"""
Cliente 1.5.3 do login central no CRM (TSK-1240): manutenção e sessão aberta.

    python manage.py test apps.crm.tests.test_sessao_central

O Conecta nunca sobe aqui: `ClienteIdentidade.verificar`, `obter` e as chamadas
de senha são substituídos. O que interessa é como o CRM REAGE a cada resposta:

- em manutenção, o login e as rotas de senha devolvem o 503 `erro: manutencao`,
  com o aviso e a previsão, que a tela de login mostra;
- com a identidade desativada no Conecta, ou sem acesso ao CRM, a requisição
  com o JWT e a renovação dele são recusadas;
- com o Conecta fora do ar, ninguém cai.
"""
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

import identidade_client
from apps.crm.models import ApiKey, VinculoIdentidade
from apps.crm.models.api_key import EscopoApiKey
from apps.crm.tests.test_login_central import (
    CENTRAL_LIGADA,
    IDENTIDADE,
    SENHA,
    TOKEN,
    resposta_do_servico,
)
from identidade_client import IdentidadeEmManutencao, IdentidadeIndisponivel, NaoEncontrado

User = get_user_model()

ME = "/api/crm/me/"
RENOVAR = "/api/token/refresh/"
PREVISAO = datetime(2026, 11, 3, 22, 30, tzinfo=timezone.utc)
AVISO = "Troca do servidor do login."

#: O cliente que a TSK-1270 publicou, conferido byte a byte.
SHA256_DO_CLIENTE = "4e2cf9fa8777814deade50b0ed35341a9a7afe2299b84378b8a37a7f1c4b09c1"


def em_manutencao():
    return IdentidadeEmManutencao("503 manutencao", mensagem=AVISO, previsao=PREVISAO)


class ClienteCopiadoTest(TestCase):
    """O `identidade_client.py` daqui é o do Conecta, sem edição."""

    def test_e_a_1_5_3_sem_edicao(self):
        arquivo = Path(settings.BASE_DIR) / "identidade_client.py"
        # Sem `\r`: o git do Windows pode trazer o arquivo com CRLF, e o hash
        # que vale é o do blob, com LF.
        conteudo = arquivo.read_bytes().replace(b"\r\n", b"\n")
        self.assertEqual(hashlib.sha256(conteudo).hexdigest(), SHA256_DO_CLIENTE)
        self.assertEqual(identidade_client.VERSAO, "1.5.3")

    def test_o_crm_nao_gere_identidades(self):
        """As escritas saíram do cliente na 1.5, e o CRM não chama nenhuma.

        O `vincular_identidades --criar-faltantes`, que chamava o `criar`, saiu
        junto. Rede para quem recopiar uma versão antiga do cliente.
        """
        for metodo in ("criar", "alterar", "conceder_acesso", "revogar_acesso",
                       "emitir_token_de_senha"):
            self.assertFalse(hasattr(identidade_client.ClienteIdentidade, metodo), metodo)


@CENTRAL_LIGADA
class ManutencaoTest(TestCase):
    """O 503 de manutenção não pode virar "tente em instantes" nem "senha errada"."""

    def setUp(self):
        cache.clear()
        self.ana = User.objects.create_user("ana", "ana@x.com", SENHA)
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)
        self.client = APIClient()

    def conferir_manutencao(self, resposta):
        self.assertEqual(resposta.status_code, 503)
        self.assertEqual(resposta.data["erro"], "manutencao")
        self.assertEqual(resposta.data["mensagem"], AVISO)
        self.assertEqual(resposta.data["previsao"], PREVISAO.isoformat())
        self.assertIn(AVISO, resposta.data["detail"])

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_login_em_manutencao(self, verificar):
        verificar.side_effect = em_manutencao()
        r = self.client.post(TOKEN, {"email": "ana@x.com", "password": SENHA}, format="json")
        self.conferir_manutencao(r)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_manutencao_sem_aviso_nem_previsao(self, verificar):
        # Sem texto no aviso, a `mensagem` é o detalhe da resposta; sem os dois,
        # vazia.
        verificar.side_effect = IdentidadeEmManutencao("")
        r = self.client.post(TOKEN, {"email": "ana@x.com", "password": SENHA}, format="json")
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.data["erro"], "manutencao")
        self.assertEqual(r.data["mensagem"], "")
        self.assertIsNone(r.data["previsao"])
        self.assertEqual(r.data["detail"], "O login está em manutenção.")

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_servico_fora_do_ar_continua_o_503_de_antes(self, verificar):
        verificar.side_effect = IdentidadeIndisponivel("fora do ar")
        r = self.client.post(TOKEN, {"email": "ana@x.com", "password": SENHA}, format="json")
        self.assertEqual(r.status_code, 503)
        self.assertNotIn("erro", r.data)

    @patch("identidade_client.ClienteIdentidade.esqueci_senha")
    def test_esqueci_senha_em_manutencao(self, pedir):
        pedir.side_effect = em_manutencao()
        r = self.client.post("/api/crm/senha/esqueci/", {"email": "ana@x.com"}, format="json")
        self.conferir_manutencao(r)

    @patch("identidade_client.ClienteIdentidade.definir_senha")
    def test_definir_senha_em_manutencao(self, definir):
        definir.side_effect = em_manutencao()
        r = self.client.post(
            "/api/crm/senha/definir/", {"token": "t", "nova_senha": "Nova#Senha123"}, format="json"
        )
        self.conferir_manutencao(r)

    @patch("identidade_client.ClienteIdentidade.trocar_senha")
    def test_trocar_senha_em_manutencao(self, trocar):
        trocar.side_effect = em_manutencao()
        self.client.force_authenticate(self.ana)
        r = self.client.post(
            "/api/crm/senha/",
            {"senha_atual": SENHA, "nova_senha": "Nova#Senha123"},
            format="json",
        )
        self.conferir_manutencao(r)


@CENTRAL_LIGADA
class SessaoAbertaTest(TestCase):
    """Desativar a pessoa no Conecta derruba a sessão aberta no CRM."""

    def setUp(self):
        cache.clear()
        self.ana = User.objects.create_user("ana", "ana@x.com", SENHA)
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)
        self.refresh = RefreshToken.for_user(self.ana)
        self.client = APIClient()

    def com_access(self):
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.refresh.access_token}")
        return self.client.get(ME)

    def renovar(self):
        return self.client.post(RENOVAR, {"refresh": str(self.refresh)}, format="json")

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_identidade_ativa_segue(self, obter):
        obter.return_value = {"identidade_id": IDENTIDADE, "ativo": True}
        self.assertEqual(self.com_access().status_code, 200)
        r = self.renovar()
        self.assertEqual(r.status_code, 200)
        self.assertIn("access", r.data)

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_identidade_desativada_derruba_a_requisicao(self, obter):
        obter.return_value = {"identidade_id": IDENTIDADE, "ativo": False}
        r = self.com_access()
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.data["detail"].code, "user_inactive")

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_jwt_renovado_com_a_identidade_desativada_e_recusado(self, obter):
        obter.return_value = {"identidade_id": IDENTIDADE, "ativo": False}
        r = self.renovar()
        self.assertEqual(r.status_code, 401)
        self.assertNotIn("access", r.data)
        obter.assert_called_once()
        self.assertEqual(str(obter.call_args.args[0]), IDENTIDADE)

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_acesso_revogado_no_crm_recusa_a_renovacao(self, obter):
        obter.side_effect = NaoEncontrado("nao_encontrado")
        self.assertEqual(self.renovar().status_code, 401)

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_conecta_fora_do_ar_nao_derruba_ninguem(self, obter):
        obter.side_effect = IdentidadeIndisponivel("fora do ar")
        self.assertEqual(self.com_access().status_code, 200)
        self.assertEqual(self.renovar().status_code, 200)

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_conecta_em_manutencao_nao_derruba_ninguem(self, obter):
        obter.side_effect = em_manutencao()
        self.assertEqual(self.com_access().status_code, 200)
        self.assertEqual(self.renovar().status_code, 200)

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_conta_desativada_aqui_nao_renova(self, obter):
        obter.return_value = {"identidade_id": IDENTIDADE, "ativo": True}
        User.objects.filter(pk=self.ana.pk).update(is_active=False)
        self.assertEqual(self.renovar().status_code, 401)
        obter.assert_not_called()

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_conta_apagada_nao_renova(self, obter):
        refresh = str(self.refresh)
        self.ana.delete()
        r = self.client.post(RENOVAR, {"refresh": refresh}, format="json")
        self.assertEqual(r.status_code, 401)
        obter.assert_not_called()

    @patch("identidade_client.ClienteIdentidade.obter")
    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_login_novo_vale_como_revalidacao(self, verificar, obter):
        """O login aceito apaga a recusa guardada: quem foi reativado entra e fica."""
        obter.return_value = {"identidade_id": IDENTIDADE, "ativo": False}
        self.assertEqual(self.renovar().status_code, 401)

        verificar.return_value = resposta_do_servico(self.ana)
        r = self.client.post(TOKEN, {"email": "ana@x.com", "password": SENHA}, format="json")
        self.assertEqual(r.status_code, 200)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        self.assertEqual(self.client.get(ME).status_code, 200)
        self.assertEqual(obter.call_count, 1)

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_chave_de_api_nao_passa_pelo_conecta(self, obter):
        """A conta de serviço da integração não tem vínculo: nada a perguntar."""
        integracao = User.objects.create_user("integracao", "int@x.com", SENHA)
        _, chave = ApiKey.gerar("n8n", integracao, escopo=EscopoApiKey.LEITURA)
        r = APIClient().get(ME, HTTP_X_API_KEY=chave)
        self.assertEqual(r.status_code, 200)
        obter.assert_not_called()


class ChaveDesligadaNaoPerguntaTest(TestCase):
    """Com `AUTH_CENTRAL_ATIVO` desligado a revalidação não pergunta nada."""

    @patch("identidade_client.ClienteIdentidade.obter")
    def test_sem_a_chave_nao_ha_pergunta(self, obter):
        cache.clear()
        ana = User.objects.create_user("ana", "ana@x.com", SENHA)
        VinculoIdentidade.objects.create(usuario=ana, identidade_id=IDENTIDADE)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(ana).access_token}")
        self.assertEqual(client.get(ME).status_code, 200)
        obter.assert_not_called()
