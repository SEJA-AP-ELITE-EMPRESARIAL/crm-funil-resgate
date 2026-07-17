"""
Regra de negócio do CRM (não conhece HTTP).

Mantém a criação/edição/remoção de clientes em transações e centraliza a
persistência para as views ficarem finas.
"""
from django.db import transaction

from apps.crm.models import Cliente


class ClienteService:
    @staticmethod
    @transaction.atomic
    def criar(dados: dict, usuario=None) -> Cliente:
        cliente = Cliente(**dados)
        if usuario is not None and usuario.is_authenticated:
            cliente.criado_por = usuario
        cliente.save()
        return cliente

    @staticmethod
    @transaction.atomic
    def atualizar(cliente: Cliente, dados: dict) -> Cliente:
        for campo, valor in dados.items():
            setattr(cliente, campo, valor)
        cliente.save()
        return cliente

    @staticmethod
    @transaction.atomic
    def remover(cliente: Cliente) -> None:
        cliente.delete()
