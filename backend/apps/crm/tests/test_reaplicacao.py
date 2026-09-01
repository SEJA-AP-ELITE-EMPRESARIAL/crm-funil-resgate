"""
Reaplicar a configuração do Conecta ID por cima de uma conta que já existe.

A configuração é semente: lida uma vez, ao criar a conta local. A reaplicação é
a exceção pedida à mão no admin do Conecta ID, e vale uma vez — sem ela, marcar
alguém como administrador de lá não teria efeito sobre quem já entrou aqui.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model

from apps.crm.models import VinculoIdentidade

from .test_login_central import CENTRAL_LIGADA, IDENTIDADE, BaseLogin

User = get_user_model()


@CENTRAL_LIGADA
class ReaplicacaoTest(BaseLogin):
    def setUp(self):
        super().setUp()
        # A conta já existe e já tem vínculo: é este o caso que a semente não
        # alcança.
        VinculoIdentidade.objects.create(usuario=self.ana, identidade_id=IDENTIDADE)

    def entrar_com(self, verificar, config=None, reaplicar=False):
        verificar.return_value = {
            "identidade_id": IDENTIDADE,
            "email": self.ana.email,
            "nome": self.ana.get_full_name() or self.ana.get_username(),
            "precisa_trocar_senha": False,
            "config_do_app": config or {},
            "reaplicar_config": reaplicar,
        }
        return self.entrar(self.ana.email)

    def staff(self):
        self.ana.refresh_from_db()
        return self.ana.is_staff

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_com_a_marca_o_staff_e_reescrito(self, verificar):
        self.assertEqual(self.entrar_com(verificar, {"staff": True}, True).status_code, 200)
        self.assertTrue(self.staff())

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_sem_a_marca_nada_acontece(self, verificar):
        """Se a configuração valesse sem pedido, tirar o staff de alguém aqui
        seria desfeito no login seguinte."""
        self.entrar_com(verificar, {"staff": True})
        self.assertFalse(self.staff())

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_a_marca_tambem_tira_o_staff(self, verificar):
        """Reaplicar é fazer valer o que está escrito, nos dois sentidos."""
        self.ana.is_staff = True
        self.ana.save(update_fields=["is_staff"])

        self.entrar_com(verificar, {"staff": False}, True)

        self.assertFalse(self.staff())

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_superusuario_nunca_vem_da_reaplicacao(self, verificar):
        """Como na criação: `is_superuser` passa por cima de toda checagem de
        permissão do Django, e não se concede isso por um campo de texto noutro
        sistema."""
        self.entrar_com(verificar, {"staff": True, "superuser": True}, True)
        self.ana.refresh_from_db()
        self.assertFalse(self.ana.is_superuser)
