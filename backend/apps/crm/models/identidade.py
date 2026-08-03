"""
Ligação com o Conecta ID.

O Conecta ID é dono de nome, e-mail e senha; este app continua dono do que a
pessoa é aqui dentro (`is_staff`, chaves de API, clientes que ela criou). O
`VinculoIdentidade` é a costura entre os dois — e é só isso que ele é.

Nada de FK para o outro banco: são Postgres diferentes, em máquinas diferentes.
O que se guarda é o UUID.
"""
import logging

from django.conf import settings
from django.db import models, transaction

logger = logging.getLogger(__name__)


class VinculoIdentidade(models.Model):
    identidade_id = models.UUIDField(
        "identidade no Conecta ID", unique=True, db_index=True
    )
    usuario = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="vinculo_identidade",
        verbose_name="usuário local",
    )
    # Copiado do Conecta ID a cada login. Guardar aqui evita uma chamada HTTP em
    # todo /api/crm/me/ — e o valor só muda no login, que é exatamente quando
    # ele passa a importar.
    precisa_trocar_senha = models.BooleanField(default=False)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "vínculo com o Conecta ID"
        verbose_name_plural = "vínculos com o Conecta ID"

    def __str__(self):
        return f"{self.usuario} <-> {self.identidade_id}"


@transaction.atomic
def resolver_usuario(dados):
    """Chamado pelo `BackendIdentidade` a cada login pelo Conecta ID.

    Ver `IDENTIDADE_RESOLVER_USUARIO` no settings. Delega o casamento ao cliente
    (por `identidade_id` primeiro, e-mail depois) e só decide o que é específico
    daqui.
    """
    from identidade_client import resolver_com_vinculo

    usuario = resolver_com_vinculo(
        dados, VinculoIdentidade, ao_criar=_criar_usuario_local
    )
    if usuario is None:
        return None

    precisa_trocar = bool(dados.get("precisa_trocar_senha"))
    VinculoIdentidade.objects.filter(usuario=usuario).update(
        precisa_trocar_senha=precisa_trocar
    )
    # O `update()` acima grava no banco e não toca no objeto que já está em
    # memória — e ele existe: ao criar o vínculo, o Django preenche o cache da
    # relação reversa em `usuario`, com o valor padrão (False). Sem sincronizar,
    # o /me logo após o login diria "não precisa trocar" para quem precisa.
    vinculo = getattr(usuario, "vinculo_identidade", None)
    if vinculo is not None:
        vinculo.precisa_trocar_senha = precisa_trocar
    return usuario


def _criar_usuario_local(dados):
    """Cria a conta de quem já existe no Conecta ID mas nunca entrou aqui.

    Quem decide que a pessoa pode usar o CRM é a concessão de acesso no Conecta
    ID — sem ela a autenticação nem chega aqui (o serviço devolve
    `sem_acesso_ao_app`). Então este ponto é consequência de uma decisão já
    tomada, não uma porta aberta.

    Nasce **sem `is_staff` e sem `is_superuser`**: o CRM não tem hierarquia de
    papéis (o único recorte é o escopo das chaves de API), então o que existe
    para errar aqui é dar admin do Django a quem só precisava ver o funil.
    Promover depois é um clique; descobrir que todo mundo virou staff, não.
    """
    from django.contrib.auth import get_user_model

    Usuario = get_user_model()
    email = (dados.get("email") or "").strip().lower()
    nome = (dados.get("nome") or "").strip()
    partes = nome.split()

    base = (email.split("@")[0] or "usuario")[:140]
    username, sufixo = base, 1
    while Usuario.objects.filter(username=username).exists():
        sufixo += 1
        username = f"{base}{sufixo}"

    usuario = Usuario.objects.create(
        username=username,
        email=email,
        first_name=partes[0][:150] if partes else "",
        last_name=" ".join(partes[1:])[:150],
        is_active=True,
    )
    # Sem senha utilizável: quem entra por aqui entra pelo Conecta ID. Uma senha
    # local viva seria um segundo caminho de entrada que ninguém lembra de fechar.
    usuario.set_unusable_password()
    usuario.save(update_fields=["password"])

    logger.info("conta local criada a partir do Conecta ID: %s (%s)", username, email)
    return usuario
