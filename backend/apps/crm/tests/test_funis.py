"""
Testes dos funis (quadros) — criar, renomear, desativar e excluir pela API.

    python manage.py test apps.crm.tests.test_funis

Até 2026-08-20 o funil só nascia no /admin ou por migration (TSK-146). O que
estes testes protegem é o que a interface passou a poder fazer: criar um funil
vazio, dar-lhe colunas depois, e sair dele sem perder cliente pelo caminho.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.crm.models import ApiKey, Cliente, EscopoApiKey, Etapa, Funil

User = get_user_model()


class FunilApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("ana", "ana@x.com", "senha12345")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.apn = Funil.objects.get(slug="indicados_apn")
        self.resgate = Funil.objects.get(slug="resgate")

    # === criação ===

    def test_cria_funil_so_com_o_nome(self):
        resp = self.client.post("/api/crm/funis/", {"nome": "Indicações Contábeis"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["slug"], "indicacoes_contabeis")
        self.assertEqual(resp.data["cor"], "#C7A444")
        self.assertTrue(resp.data["ativo"])
        # nasce vazio: as colunas são o passo seguinte, na própria tela
        self.assertEqual(resp.data["etapas"], [])
        self.assertEqual(resp.data["total_clientes"], 0)

    def test_funil_novo_entra_no_fim_do_seletor(self):
        ultima = Funil.objects.order_by("-ordem").first().ordem
        resp = self.client.post("/api/crm/funis/", {"nome": "Parcerias"})
        self.assertEqual(resp.data["ordem"], ultima + 1)

    def test_aceita_cor_descricao_e_posicao(self):
        resp = self.client.post("/api/crm/funis/", {
            "nome": "Upsell", "cor": "#3D7EC5", "descricao": "Base atual", "ordem": 9,
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["cor"], "#3D7EC5")
        self.assertEqual(resp.data["descricao"], "Base atual")
        self.assertEqual(resp.data["ordem"], 9)

    def test_slug_desvia_de_colisao(self):
        """Nomes diferentes podem gerar o mesmo slug — o segundo ganha sufixo."""
        resp = self.client.post("/api/crm/funis/", {"nome": "Resgate!"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["slug"], "resgate_2")

    def test_nome_duplicado_ignora_maiusculas(self):
        resp = self.client.post("/api/crm/funis/", {"nome": "  base elite "})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["nome"][0], "Já existe um funil com esse nome.")

    def test_nome_em_branco(self):
        resp = self.client.post("/api/crm/funis/", {"nome": "   "})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("nome", resp.data)

    def test_cor_sem_cerquilha(self):
        resp = self.client.post("/api/crm/funis/", {"nome": "Eventos", "cor": "3D7EC5"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("cor", resp.data)

    def test_colunas_criadas_no_funil_novo(self):
        """O fluxo real da tela: cria o funil e em seguida as colunas dele."""
        funil_id = self.client.post("/api/crm/funis/", {"nome": "Eventos"}).data["id"]
        self.client.post("/api/crm/etapas/", {"funil": funil_id, "nome": "Convidado"})
        self.client.post("/api/crm/etapas/", {"funil": funil_id, "nome": "Presente"})

        resp = self.client.get("/api/crm/funis/")
        eventos = next(f for f in resp.data["results"] if f["id"] == funil_id)
        self.assertEqual([e["nome"] for e in eventos["etapas"]], ["Convidado", "Presente"])

    # === listagem ===

    def test_lista_traz_so_os_ativos_por_padrao(self):
        self.client.patch(f"/api/crm/funis/{self.resgate.id}/", {"ativo": False})
        slugs = [f["slug"] for f in self.client.get("/api/crm/funis/").data["results"]]
        self.assertNotIn("resgate", slugs)
        self.assertIn("indicados_apn", slugs)

    def test_lista_com_inativos(self):
        self.client.patch(f"/api/crm/funis/{self.resgate.id}/", {"ativo": False})

        todos = [f["slug"] for f in self.client.get("/api/crm/funis/?ativo=todos").data["results"]]
        self.assertIn("resgate", todos)
        self.assertIn("indicados_apn", todos)

        inativos = [f["slug"] for f in self.client.get("/api/crm/funis/?ativo=0").data["results"]]
        self.assertEqual(inativos, ["resgate"])

    def test_detalhe_traz_as_colunas(self):
        resp = self.client.get(f"/api/crm/funis/{self.apn.id}/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["etapas"]), 8)

    def test_total_clientes(self):
        Cliente.objects.create(nome="Empresa", funil=self.apn)
        resp = self.client.get(f"/api/crm/funis/{self.apn.id}/")
        self.assertEqual(resp.data["total_clientes"], 1)

    # === edição ===

    def test_renomear_nao_muda_o_slug(self):
        resp = self.client.patch(
            f"/api/crm/funis/{self.resgate.id}/", {"nome": "Win-back", "cor": "#123456"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["nome"], "Win-back")
        self.assertEqual(resp.data["cor"], "#123456")
        self.assertEqual(resp.data["slug"], "resgate")

    def test_renomear_para_o_proprio_nome(self):
        resp = self.client.patch(f"/api/crm/funis/{self.resgate.id}/", {"nome": "Resgate"})
        self.assertEqual(resp.status_code, 200)

    def test_renomear_para_nome_de_outro(self):
        resp = self.client.patch(f"/api/crm/funis/{self.resgate.id}/", {"nome": "Base Elite"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("nome", resp.data)

    def test_desativar_preserva_os_clientes(self):
        cliente = Cliente.objects.create(nome="Empresa", funil=self.resgate)
        resp = self.client.patch(f"/api/crm/funis/{self.resgate.id}/", {"ativo": False})
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["ativo"])
        cliente.refresh_from_db()
        self.assertEqual(cliente.funil_id, self.resgate.id)

    # === exclusão ===

    def test_exclui_funil_vazio(self):
        resp = self.client.delete(f"/api/crm/funis/{self.resgate.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Funil.objects.filter(pk=self.resgate.pk).exists())

    def test_excluir_leva_as_colunas_junto(self):
        """Coluna só existe dentro de um funil — cai em cascata, de propósito."""
        resp = self.client.delete(f"/api/crm/funis/{self.apn.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Etapa.objects.filter(funil_id=self.apn.id).exists())

    def test_nao_exclui_funil_com_clientes(self):
        Cliente.objects.create(nome="Ocupando o funil", funil=self.apn)
        resp = self.client.delete(f"/api/crm/funis/{self.apn.id}/")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("Mova-os para outro funil", resp.data["erro"])
        self.assertTrue(Funil.objects.filter(pk=self.apn.pk).exists())

    def test_nao_exclui_funil_com_cliente_em_coluna(self):
        """O cliente segura tanto a coluna quanto o funil — nada some por baixo."""
        etapa = Etapa.objects.get(funil=self.apn, slug="priorizado")
        Cliente.objects.create(nome="Na coluna", funil=self.apn, etapa=etapa)
        resp = self.client.delete(f"/api/crm/funis/{self.apn.id}/")
        self.assertEqual(resp.status_code, 409)
        self.assertTrue(Etapa.objects.filter(pk=etapa.pk).exists())

    # === autorização ===

    def test_sem_sessao(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post("/api/crm/funis/", {"nome": "X"}).status_code, 401)

    def test_chave_de_leitura_nao_cria_funil(self):
        self.client.force_authenticate(user=None)
        _, chave = ApiKey.gerar("n8n leitura", self.user, escopo=EscopoApiKey.LEITURA)
        resp = self.client.post(
            "/api/crm/funis/", {"nome": "Via integração"}, HTTP_X_API_KEY=chave
        )
        self.assertEqual(resp.status_code, 403)


class ImportacaoDeFunilNovoTests(TestCase):
    """A planilha tem que enxergar funil e coluna criados agora há pouco.

    O mapa de colunas da importação vivia num default mutável do módulo, ou
    seja, pelo processo inteiro do gunicorn: quem importasse, criasse uma coluna
    e importasse de novo levava "etapa não existe" até o worker reiniciar. Com
    funil criável pela tela isso deixou de ser hipótese — é o fluxo normal.
    """

    def setUp(self):
        self.user = User.objects.create_user("ana", "ana@x.com", "senha12345")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @staticmethod
    def _planilha(linhas):
        from io import BytesIO

        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["Funil", "Nome / Empresa", "Etapa"])
        for linha in linhas:
            ws.append(linha)
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = "teste.xlsx"
        return buf

    def _importar(self, linhas):
        return self.client.post(
            "/api/crm/clientes/importar/", {"arquivo": self._planilha(linhas)}, format="multipart"
        )

    def test_coluna_criada_depois_de_uma_importacao_e_reconhecida(self):
        resp = self._importar([["Indicados APN", "Primeira", "Inscrito"]])
        self.assertEqual(resp.data["criados"], 1)

        apn = Funil.objects.get(slug="indicados_apn")
        self.client.post("/api/crm/etapas/", {"funil": apn.id, "nome": "Reunião Marcada"})

        resp = self._importar([["Indicados APN", "Segunda", "Reunião Marcada"]])
        self.assertEqual(resp.data["erros"], [])
        self.assertEqual(Cliente.objects.get(nome="Segunda").etapa.slug, "reuniao_marcada")

    def test_funil_criado_pela_tela_aceita_importacao(self):
        """Fluxo completo da TSK-146: criar o funil, dar-lhe colunas, importar."""
        funil_id = self.client.post("/api/crm/funis/", {"nome": "Parcerias"}).data["id"]
        self.client.post("/api/crm/etapas/", {"funil": funil_id, "nome": "Prospectado"})

        resp = self._importar([["Parcerias", "Escritório Contábil", "Prospectado"]])
        self.assertEqual(resp.data["erros"], [])
        self.assertEqual(resp.data["criados"], 1)
        cliente = Cliente.objects.get(nome="Escritório Contábil")
        self.assertEqual(cliente.funil_id, funil_id)
        self.assertEqual(cliente.etapa.slug, "prospectado")
