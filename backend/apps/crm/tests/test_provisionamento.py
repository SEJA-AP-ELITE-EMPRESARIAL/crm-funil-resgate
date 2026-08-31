"""
A configuração que o acesso carrega do Conecta ID para dentro do CRM.

O CRM não tem tela de usuários: conceder acesso no Conecta ID é a ÚNICA porta, e
a conta local nasce no primeiro login. Era a metade que faltava — quem concedia
não tinha onde dizer que aquela pessoa administra o Django daqui, e alguém
precisava ir promover depois, em outro lugar.

Como no `test_login_central`, o Conecta ID nunca sobe: o que se testa é como o
CRM REAGE ao que ele manda.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model

from .test_login_central import CENTRAL_LIGADA, BaseLogin

User = get_user_model()

IDENTIDADE_NOVA = "22222222-2222-4222-8222-222222222222"


@CENTRAL_LIGADA
class ProvisionamentoTest(BaseLogin):
    def entrar_como_novata(self, verificar, config=None):
        verificar.return_value = {
            "identidade_id": IDENTIDADE_NOVA,
            "email": "novata@x.com",
            "nome": "Novata da Silva",
            "precisa_trocar_senha": False,
            "config_do_app": config or {},
        }
        return self.entrar("novata@x.com")

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_staff_vem_da_configuracao_do_acesso(self, verificar):
        self.assertEqual(self.entrar_como_novata(verificar, {"staff": True}).status_code, 200)
        self.assertTrue(User.objects.get(email="novata@x.com").is_staff)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_sem_configuracao_continua_nascendo_sem_staff(self, verificar):
        self.assertEqual(self.entrar_como_novata(verificar).status_code, 200)
        self.assertFalse(User.objects.get(email="novata@x.com").is_staff)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_superusuario_nunca_vem_da_configuracao(self, verificar):
        """`is_superuser` não é um grau a mais de `is_staff`.

        Ele passa por cima de toda checagem de permissão do Django, e concedê-lo
        preenchendo um campo de texto noutro sistema seria poder demais por um
        caminho curto demais. Nem marcando `superuser` na carga ele sai.
        """
        self.entrar_como_novata(verificar, {"staff": True, "superuser": True})
        self.assertFalse(User.objects.get(email="novata@x.com").is_superuser)

    @patch("identidade_client.ClienteIdentidade.verificar")
    def test_configuracao_nao_reaplica_a_cada_login(self, verificar):
        """Semente, não fonte de verdade contínua.

        Se ela valesse a cada login, tirar o staff de alguém aqui seria desfeito
        no acesso seguinte — e ninguém ligaria uma coisa à outra.
        """
        self.entrar_como_novata(verificar, {"staff": True})
        nova = User.objects.get(email="novata@x.com")
        nova.is_staff = False
        nova.save(update_fields=["is_staff"])

        self.entrar_como_novata(verificar, {"staff": True})
        nova.refresh_from_db()
        self.assertFalse(nova.is_staff)
