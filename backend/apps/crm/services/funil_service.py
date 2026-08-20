"""Regra de negócio dos funis (quadros)."""
from django.db import transaction
from django.db.models import ProtectedError

from apps.crm.models import Funil


class FunilEmUso(Exception):
    """Tentativa de excluir um funil que ainda tem clientes."""


class FunilService:
    @staticmethod
    @transaction.atomic
    def criar(dados: dict) -> Funil:
        funil = Funil(**dados)
        if not funil.slug:
            funil.slug = Funil.gerar_slug(funil.nome)
        # Funil novo entra no fim do seletor, a não ser que a posição venha no payload.
        if not dados.get("ordem"):
            funil.ordem = Funil.proxima_ordem()
        funil.save()
        return funil

    @staticmethod
    @transaction.atomic
    def atualizar(funil: Funil, dados: dict) -> Funil:
        for campo, valor in dados.items():
            setattr(funil, campo, valor)
        funil.save()
        return funil

    @staticmethod
    @transaction.atomic
    def remover(funil: Funil) -> None:
        """Só remove funil sem clientes — a FK de Cliente é PROTECT justamente
        para isso.

        As colunas caem em cascata, e isso é intencional: coluna só existe
        dentro de um funil. Cliente, não — ele é a base da empresa e sobrevive
        ao quadro, então quem quiser excluir move os cartões antes (ou apenas
        desativa o funil, que o tira do seletor sem perder histórico).
        """
        try:
            funil.delete()
        except ProtectedError as exc:
            total = funil.clientes.count()
            raise FunilEmUso(
                f"O funil '{funil.nome}' tem {total} cliente(s). "
                "Mova-os para outro funil antes de excluí-lo, ou desative o funil "
                "para tirá-lo do seletor sem perder o histórico."
            ) from exc
