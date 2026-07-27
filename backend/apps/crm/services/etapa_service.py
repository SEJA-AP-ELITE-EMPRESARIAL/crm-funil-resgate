"""Regra de negócio das colunas do Kanban."""
from django.db import transaction
from django.db.models import ProtectedError

from apps.crm.models import Etapa


class EtapaEmUso(Exception):
    """Tentativa de excluir uma coluna que ainda tem clientes."""


class EtapaService:
    @staticmethod
    @transaction.atomic
    def criar(dados: dict) -> Etapa:
        etapa = Etapa(**dados)
        if not etapa.slug:
            etapa.slug = Etapa.gerar_slug(etapa.funil_id, etapa.nome)
        # Coluna nova entra no fim do board, a não ser que a posição venha no payload.
        if not dados.get("ordem"):
            etapa.ordem = Etapa.proxima_ordem(etapa.funil_id)
        etapa.save()
        return etapa

    @staticmethod
    @transaction.atomic
    def atualizar(etapa: Etapa, dados: dict) -> Etapa:
        for campo, valor in dados.items():
            setattr(etapa, campo, valor)
        etapa.save()
        return etapa

    @staticmethod
    @transaction.atomic
    def remover(etapa: Etapa) -> None:
        """Só remove coluna vazia — a FK é PROTECT justamente para isso.

        Apagar uma coluna com clientes os deixaria órfãos silenciosamente; quem
        quiser excluir move os cartões antes.
        """
        try:
            etapa.delete()
        except ProtectedError as exc:
            total = etapa.clientes.count()
            raise EtapaEmUso(
                f"A coluna '{etapa.nome}' tem {total} cliente(s). "
                "Mova os cartões para outra coluna antes de excluí-la."
            ) from exc

    @staticmethod
    @transaction.atomic
    def reordenar(funil_id: int, ids_em_ordem: list[int]) -> list[Etapa]:
        """Aplica a ordem recebida; ids fora do funil são ignorados."""
        etapas = {e.id: e for e in Etapa.objects.filter(funil_id=funil_id)}
        for posicao, etapa_id in enumerate(ids_em_ordem):
            etapa = etapas.get(int(etapa_id))
            if etapa is not None and etapa.ordem != posicao:
                etapa.ordem = posicao
                etapa.save(update_fields=["ordem", "atualizado_em"])
        return list(Etapa.objects.filter(funil_id=funil_id))
