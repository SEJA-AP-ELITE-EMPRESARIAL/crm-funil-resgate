"""
`exportar_provisionamento` — a fotografia que o Conecta ID vai guardar.

Só leitura. Este app não pode escrever a própria configuração pela API (não tem
`pode_gerir_identidades`), e é por isso que o backfill dele passa por arquivo.
"""
import json
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.crm.models import VinculoIdentidade

User = get_user_model()

IDENTIDADE_ID = "11111111-1111-4111-8111-111111111111"


class ExportarProvisionamentoTest(TestCase):
    def setUp(self):
        self.ana = User.objects.create_user("ana", "ana@x.com", "senha12345")
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE_ID)

    def exportar(self, **opcoes):
        saida = StringIO()
        call_command("exportar_provisionamento", stdout=saida, stderr=StringIO(), **opcoes)
        return json.loads(saida.getvalue())

    def test_exporta_o_staff_com_o_app_no_arquivo(self):
        dados = self.exportar()
        self.assertEqual(dados["app"], "crm")
        self.assertEqual(dados["itens"][0]["configuracao"], {"staff": False})

    def test_staff_falso_e_exportado_em_vez_de_omitido(self):
        """`staff=False` descreve fielmente quem só vê o funil.

        Omitir faria o admin mostrar "—" e deixar no ar a dúvida entre "não
        administra" e "ninguém preencheu".
        """
        self.assertIn("staff", self.exportar()["itens"][0]["configuracao"])

    def test_staff_verdadeiro_sai_como_verdadeiro(self):
        self.ana.is_staff = True
        self.ana.save(update_fields=["is_staff"])
        self.assertEqual(self.exportar()["itens"][0]["configuracao"], {"staff": True})

    def test_superusuario_nunca_entra_no_arquivo(self):
        """Ele passa por cima de toda checagem de permissão do Django.

        Nem descrever nem conceder isso se faz por um campo de texto noutro
        sistema.
        """
        self.ana.is_superuser = True
        self.ana.save(update_fields=["is_superuser"])
        self.assertEqual(
            sorted(self.exportar()["itens"][0]["configuracao"]), ["staff"]
        )
