from rest_framework import serializers

from apps.crm.models import Funil

from .etapa import EtapaSerializer


class FunilSerializer(serializers.ModelSerializer):
    """Funil + suas colunas.

    As etapas vêm embutidas de propósito: o front carrega funis e colunas numa
    requisição só, e o Kanban precisa das duas coisas para montar o board.
    """

    etapas = EtapaSerializer(many=True, read_only=True)

    class Meta:
        model = Funil
        fields = ["id", "nome", "slug", "cor", "descricao", "ativo", "ordem", "etapas"]
        read_only_fields = fields
