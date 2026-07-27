"""
Testes das etapas (colunas do Kanban) — agora pertencem a cada funil.

    python manage.py test apps.crm.tests.test_etapas
"""
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from apps.crm.models import Cliente, Etapa, Funil

User = get_user_model()


class MigracaoDeEtapasTests(TransactionTestCase):
    """Prova a 0007 de verdade: volta o schema para antes dela, insere clientes
    com as etapas antigas (as mesmas que existem em produção) e reaplica.

    É o pedaço mais arriscado da mudança — sem isto, o mapeamento seria só uma
    tabela de strings que ninguém executou.
    """

    ANTES = ("crm", "0005_apikey")
    DEPOIS = ("crm", "0008_cliente_etapa_fk")

    def _migrar(self, alvo):
        executor = MigrationExecutor(connection)
        executor.loader.build_graph()
        executor.migrate([alvo])
        executor.loader.build_graph()
        return executor

    def tearDown(self):
        self._migrar(self.DEPOIS)

    @staticmethod
    def _funil(modelo_funil, slug, nome, ordem):
        """TransactionTestCase trunca as tabelas entre testes e leva junto os
        funis da migration 0003 — cada teste garante os seus."""
        funil, _ = modelo_funil.objects.get_or_create(
            slug=slug, defaults={"nome": nome, "ordem": ordem}
        )
        return funil

    def test_mapeia_as_etapas_em_uso_em_producao(self):
        executor = self._migrar(self.ANTES)
        antigo = executor.loader.project_state([self.ANTES]).apps
        Funil_ = antigo.get_model("crm", "Funil")
        Cliente_ = antigo.get_model("crm", "Cliente")

        apn = self._funil(Funil_, "indicados_apn", "Indicados APN", 1)
        # A distribuição real de produção (235 clientes em 4 etapas).
        for nome, etapa in [
            ("Um", "priorizado"),
            ("Dois", "contato_realizado"),
            ("Tres", "conectado"),
            ("Quatro", "perdido"),
            ("Cinco", "diagnostico"),   # sem equivalente no fluxo novo
            ("Seis", ""),               # fora do board
        ]:
            Cliente_.objects.create(nome=nome, funil=apn, etapa=etapa)

        self._migrar(self.DEPOIS)

        por_nome = {c.nome: c for c in Cliente.objects.select_related("etapa")}
        self.assertEqual(por_nome["Um"].etapa.slug, "priorizado")
        self.assertEqual(por_nome["Dois"].etapa.slug, "primeiro_contato")
        self.assertEqual(por_nome["Tres"].etapa.slug, "em_conversa")
        self.assertEqual(por_nome["Quatro"].etapa.slug, "encerrado")
        # sem equivalente: vira coluna legada, preservando o nome — nada se perde
        self.assertEqual(por_nome["Cinco"].etapa.slug, "diagnostico")
        self.assertEqual(por_nome["Cinco"].etapa.nome, "Diagnóstico")
        self.assertEqual(por_nome["Cinco"].etapa.tipo, "auxiliar")
        # já estava fora do board
        self.assertIsNone(por_nome["Seis"].etapa)

    def test_preserva_etapas_de_outros_funis(self):
        """Base Elite e Resgate não recebem o fluxo do APN, mas se tiverem
        clientes (como num ambiente de dev), as colunas são recriadas."""
        executor = self._migrar(self.ANTES)
        antigo = executor.loader.project_state([self.ANTES]).apps
        Funil_ = antigo.get_model("crm", "Funil")
        Cliente_ = antigo.get_model("crm", "Cliente")

        resgate = self._funil(Funil_, "resgate", "Resgate", 3)
        Cliente_.objects.create(nome="Win-back", funil=resgate, etapa="reativado")

        self._migrar(self.DEPOIS)

        cliente = Cliente.objects.select_related("etapa", "etapa__funil").get(nome="Win-back")
        self.assertEqual(cliente.etapa.slug, "reativado")
        self.assertEqual(cliente.etapa.nome, "Reativado")
        self.assertEqual(cliente.etapa.funil.slug, "resgate")


class EtapaSeedTests(TestCase):
    """O que a migration 0007 deixou no banco."""

    def test_indicados_apn_tem_o_fluxo_novo(self):
        apn = Funil.objects.get(slug="indicados_apn")
        slugs = list(apn.etapas.order_by("ordem").values_list("slug", flat=True))
        self.assertEqual(slugs, [
            "priorizado", "primeiro_contato", "em_conversa", "interessado",
            "negociacao", "inscrito", "follow_up", "encerrado",
        ])

    def test_outros_funis_comecam_sem_colunas(self):
        for slug in ("base_elite", "resgate"):
            self.assertEqual(Funil.objects.get(slug=slug).etapas.count(), 0, slug)

    def test_tipos_definem_a_esteira(self):
        apn = Funil.objects.get(slug="indicados_apn")
        por_slug = {e.slug: e.tipo for e in apn.etapas.all()}
        self.assertEqual(por_slug["inscrito"], "ganho")
        self.assertEqual(por_slug["encerrado"], "perda")
        self.assertEqual(por_slug["follow_up"], "auxiliar")
        self.assertEqual(por_slug["priorizado"], "progressao")


class EtapaApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("ana", "ana@x.com", "senha12345")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.apn = Funil.objects.get(slug="indicados_apn")
        self.resgate = Funil.objects.get(slug="resgate")

    def test_lista_filtrada_por_funil(self):
        resp = self.client.get("/api/crm/etapas/?funil=indicados_apn")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 8)

        resp = self.client.get("/api/crm/etapas/?funil=resgate")
        self.assertEqual(resp.data["results"], [])

    def test_funis_trazem_as_etapas_embutidas(self):
        resp = self.client.get("/api/crm/funis/")
        por_slug = {f["slug"]: f for f in resp.data["results"]}
        self.assertEqual(len(por_slug["indicados_apn"]["etapas"]), 8)
        self.assertEqual(por_slug["resgate"]["etapas"], [])

    def test_cria_coluna_em_funil_vazio(self):
        resp = self.client.post("/api/crm/etapas/", {
            "funil": self.resgate.id, "nome": "Primeiro Contato", "cor": "#EA932E",
        })
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["slug"], "primeiro_contato")
        self.assertEqual(resp.data["ordem"], 0)
        self.assertEqual(resp.data["tipo"], "progressao")

        # a segunda entra depois da primeira
        resp = self.client.post("/api/crm/etapas/", {"funil": self.resgate.id, "nome": "Fechado"})
        self.assertEqual(resp.data["ordem"], 1)

    def test_nome_duplicado_no_mesmo_funil(self):
        resp = self.client.post("/api/crm/etapas/", {"funil": self.apn.id, "nome": "Inscrito"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("nome", resp.data)

    def test_mesmo_nome_em_funis_diferentes_e_permitido(self):
        resp = self.client.post("/api/crm/etapas/", {"funil": self.resgate.id, "nome": "Inscrito"})
        self.assertEqual(resp.status_code, 201)

    def test_renomear_e_recolorir(self):
        etapa = Etapa.objects.get(funil=self.apn, slug="follow_up")
        resp = self.client.patch(
            f"/api/crm/etapas/{etapa.id}/", {"nome": "Retomar depois", "cor": "#123456"}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["nome"], "Retomar depois")
        self.assertEqual(resp.data["cor"], "#123456")
        # o slug não muda: é o identificador estável usado pela API
        self.assertEqual(resp.data["slug"], "follow_up")

    def test_reordenar(self):
        etapas = list(Etapa.objects.filter(funil=self.apn).order_by("ordem"))
        invertida = [e.id for e in reversed(etapas)]
        resp = self.client.post(
            "/api/crm/etapas/reordenar/", {"funil": self.apn.id, "ordem": invertida}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        nova = list(Etapa.objects.filter(funil=self.apn).order_by("ordem").values_list("id", flat=True))
        self.assertEqual(nova, invertida)

    def test_exclui_coluna_vazia(self):
        etapa = Etapa.objects.get(funil=self.apn, slug="follow_up")
        resp = self.client.delete(f"/api/crm/etapas/{etapa.id}/")
        self.assertEqual(resp.status_code, 204)
        self.assertFalse(Etapa.objects.filter(pk=etapa.pk).exists())

    def test_nao_exclui_coluna_com_clientes(self):
        etapa = Etapa.objects.get(funil=self.apn, slug="priorizado")
        Cliente.objects.create(nome="Ocupando a coluna", funil=self.apn, etapa=etapa)
        resp = self.client.delete(f"/api/crm/etapas/{etapa.id}/")
        self.assertEqual(resp.status_code, 409)
        self.assertIn("Mova os cartões", resp.data["erro"])
        self.assertTrue(Etapa.objects.filter(pk=etapa.pk).exists())


class ClienteEtapaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("ana", "ana@x.com", "senha12345")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.apn = Funil.objects.get(slug="indicados_apn")
        self.resgate = Funil.objects.get(slug="resgate")

    def test_aceita_slug_ou_id_na_etapa(self):
        etapa = Etapa.objects.get(funil=self.apn, slug="em_conversa")

        resp = self.client.post(
            "/api/crm/clientes/", {"funil": self.apn.id, "nome": "Por slug", "etapa": "em_conversa"}
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["etapa"], etapa.id)

        resp = self.client.post(
            "/api/crm/clientes/", {"funil": self.apn.id, "nome": "Por id", "etapa": etapa.id}
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["etapa_slug"], "em_conversa")

    def test_expoe_dados_da_etapa(self):
        etapa = Etapa.objects.get(funil=self.apn, slug="inscrito")
        c = Cliente.objects.create(nome="Ganho", funil=self.apn, etapa=etapa)
        resp = self.client.get(f"/api/crm/clientes/{c.id}/")
        self.assertEqual(resp.data["etapa_display"], "Inscrito")
        self.assertEqual(resp.data["etapa_emoji"], "✅")
        self.assertEqual(resp.data["etapa_cor"], "#31C47F")
        self.assertEqual(resp.data["etapa_tipo"], "ganho")

    def test_recusa_etapa_de_outro_funil(self):
        resp = self.client.post(
            "/api/crm/clientes/",
            {"funil": self.resgate.id, "nome": "Errado", "etapa": "inscrito"},
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("não existe no funil", str(resp.data["etapa"]))

    def test_recusa_etapa_sem_funil(self):
        resp = self.client.post("/api/crm/clientes/", {"nome": "Sem funil", "etapa": "priorizado"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Defina o funil", str(resp.data["etapa"]))

    def test_mover_de_etapa(self):
        c = Cliente.objects.create(
            nome="Movendo", funil=self.apn,
            etapa=Etapa.objects.get(funil=self.apn, slug="priorizado"),
        )
        resp = self.client.patch(f"/api/crm/clientes/{c.id}/", {"etapa": "interessado"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["etapa_slug"], "interessado")

    def test_tira_do_board_com_null(self):
        c = Cliente.objects.create(
            nome="Saindo", funil=self.apn,
            etapa=Etapa.objects.get(funil=self.apn, slug="priorizado"),
        )
        resp = self.client.patch(f"/api/crm/clientes/{c.id}/", {"etapa": None}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data["etapa"])

    def test_config_nao_devolve_mais_etapas_globais(self):
        resp = self.client.get("/api/crm/config/")
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("etapas", resp.data)
        self.assertIn("comissao_rate", resp.data)
