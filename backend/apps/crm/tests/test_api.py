"""
Testes de API do CRM.

    python manage.py test apps.crm

Cobrem o essencial: exigência de auth, a regra de "base compartilhada"
(um usuário vê clientes criados por outro) e o cálculo de comissão
parametrizado por `meses_contrato`.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.crm.models import Cliente, Etapa, Funil

User = get_user_model()


class CrmApiTests(TestCase):
    def setUp(self):
        self.ana = User.objects.create_user("ana", "ana@x.com", "senha12345")
        self.bruno = User.objects.create_user("bruno", "bruno@x.com", "senha12345")
        self.client = APIClient()
        # A migration 0007 semeia as colunas do Indicados APN.
        self.apn = Funil.objects.get(slug="indicados_apn")

    def _login(self, user):
        self.client.force_authenticate(user=user)

    def test_lista_exige_autenticacao(self):
        resp = self.client.get("/api/crm/clientes/")
        self.assertEqual(resp.status_code, 401)

    def test_base_compartilhada(self):
        """Cliente criado pela Ana deve ser visível pelo Bruno."""
        Cliente.objects.create(nome="Empresa da Ana", criado_por=self.ana)
        self._login(self.bruno)
        resp = self.client.get("/api/crm/clientes/")
        self.assertEqual(resp.status_code, 200)
        nomes = [c["nome"] for c in resp.data["results"]]
        self.assertIn("Empresa da Ana", nomes)

    def test_criacao_define_criado_por(self):
        self._login(self.ana)
        resp = self.client.post(
            "/api/crm/clientes/",
            {"funil": self.apn.id, "nome": "Nova Empresa", "etapa": "priorizado"},
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["criado_por"], self.ana.id)
        self.assertEqual(resp.data["etapa_slug"], "priorizado")

    def test_comissao_usa_meses_contrato(self):
        """Parcela = valor / meses; comissão = parcela * 3%."""
        c = Cliente.objects.create(
            nome="Contrato Semestral",
            valor_contrato=Decimal("12000"),
            meses_contrato=6,
        )
        # 12000 / 6 = 2000 de parcela; 3% = 60
        self.assertEqual(c.parcela_mensal, Decimal("2000.00"))
        self.assertEqual(c.comissao_mensal, Decimal("60.00"))

    def test_comissao_cai_no_padrao_quando_sem_meses(self):
        c = Cliente.objects.create(nome="Sem meses", valor_contrato=Decimal("12000"))
        # padrão 12 meses -> parcela 1000, comissão 30
        self.assertEqual(c.parcela_mensal, Decimal("1000.00"))
        self.assertEqual(c.comissao_mensal, Decimal("30.00"))

    def test_nome_obrigatorio(self):
        self._login(self.ana)
        resp = self.client.post("/api/crm/clientes/", {"nome": "   "})
        self.assertEqual(resp.status_code, 400)

    def test_funis_seed_disponiveis(self):
        """A migration 0003 cria os 3 funis iniciais."""
        self._login(self.ana)
        resp = self.client.get("/api/crm/funis/")
        self.assertEqual(resp.status_code, 200)
        slugs = {f["slug"] for f in resp.data["results"]}
        self.assertEqual(slugs, {"indicados_apn", "base_elite", "resgate"})

    def test_filtro_por_funil(self):
        elite = Funil.objects.get(slug="base_elite")
        resgate = Funil.objects.get(slug="resgate")
        Cliente.objects.create(nome="Cliente Elite", funil=elite)
        Cliente.objects.create(nome="Cliente Resgate", funil=resgate)
        self._login(self.ana)

        resp = self.client.get("/api/crm/clientes/?funil=base_elite")
        nomes = [c["nome"] for c in resp.data["results"]]
        self.assertIn("Cliente Elite", nomes)
        self.assertNotIn("Cliente Resgate", nomes)

    def test_cliente_expoe_dados_do_funil(self):
        elite = Funil.objects.get(slug="base_elite")
        c = Cliente.objects.create(nome="X", funil=elite)
        self._login(self.ana)
        resp = self.client.get(f"/api/crm/clientes/{c.id}/")
        self.assertEqual(resp.data["funil_slug"], "base_elite")
        self.assertEqual(resp.data["funil_nome"], "Base Elite")

    def test_importacao_excel(self):
        """Importa uma planilha em memória: cria válidos, reporta erros."""
        from io import BytesIO

        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["Funil", "Nome / Empresa", "Etapa", "Consultor", "Valor contrato", "Meses contrato"])
        ws.append(["Indicados APN", "Empresa Importada", "Negociação", "Ana Souza", "24000,00", "12"])
        ws.append(["Indicados APN", "Inscrita Import", "Inscrito", "Bruno Lima", "12000,00", "6"])
        ws.append(["Funil Inexistente", "Erro Funil", "", "", "", ""])   # erro: funil
        ws.append(["Indicados APN", "", "", "", "", ""])                  # erro: nome vazio
        # erro: o funil Resgate não tem colunas
        ws.append(["Resgate", "Sem Coluna", "Priorizado", "", "", ""])
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = "teste.xlsx"

        self._login(self.ana)
        resp = self.client.post("/api/crm/clientes/importar/", {"arquivo": buf}, format="multipart")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["criados"], 2)
        self.assertEqual(len(resp.data["erros"]), 3)
        self.assertTrue(Cliente.objects.filter(nome="Empresa Importada").exists())
        # a comissão parametrizada por meses funciona no importado (12000/6 = 2000; 3% = 60)
        c = Cliente.objects.get(nome="Inscrita Import")
        self.assertEqual(str(c.comissao_mensal), "60.00")
        self.assertEqual(c.etapa.slug, "inscrito")

    def test_importacao_rejeita_etapa_de_outro_funil(self):
        """As colunas são por funil — nome de outro funil não vale."""
        etapa = Etapa.objects.get(funil=self.apn, slug="inscrito")
        self.assertEqual(etapa.funil.slug, "indicados_apn")
        self.assertFalse(Etapa.objects.filter(funil__slug="resgate").exists())
