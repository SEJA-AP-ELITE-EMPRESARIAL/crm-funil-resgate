"""Serializers do Funil (quadro) — leitura com colunas embutidas + escrita."""
from rest_framework import serializers

from apps.crm.models import Funil

from .etapa import EtapaSerializer


class FunilSerializer(serializers.ModelSerializer):
    """Funil + suas colunas.

    As etapas vêm embutidas de propósito: o front carrega funis e colunas numa
    requisição só, e o Kanban precisa das duas coisas para montar o board.
    """

    etapas = EtapaSerializer(many=True, read_only=True)
    total_clientes = serializers.IntegerField(source="clientes.count", read_only=True)

    class Meta:
        model = Funil
        fields = [
            "id", "nome", "slug", "cor", "descricao", "ativo", "ordem",
            "etapas", "total_clientes",
        ]
        read_only_fields = fields


class FunilWriteSerializer(serializers.ModelSerializer):
    """Entrada — `slug` e `ordem` são derivados quando não informados.

    O `slug` fica de fora de propósito, como em Etapa: é o identificador estável
    que a API, a importação de planilha e os links do front usam. Renomear o
    funil não quebra integração.
    """

    # Em form-data o BooleanField do DRF lê campo AUSENTE como False (regra de
    # checkbox HTML). Sem este default explícito, um POST multipart sem `ativo`
    # criaria o funil já desativado — invisível no seletor logo ao nascer.
    ativo = serializers.BooleanField(required=False, default=True)

    class Meta:
        model = Funil
        fields = ["nome", "cor", "descricao", "ativo", "ordem"]
        extra_kwargs = {
            # O UniqueValidator do campo sai para a checagem case-insensitive
            # abaixo dar a mensagem certa ("Base Elite" vs "base elite").
            "nome": {"validators": []},
        }

    def validate_nome(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Nome do funil é obrigatório.")
        existentes = Funil.objects.filter(nome__iexact=value)
        if self.instance:
            existentes = existentes.exclude(pk=self.instance.pk)
        if existentes.exists():
            raise serializers.ValidationError("Já existe um funil com esse nome.")
        return value

    def validate_cor(self, value: str) -> str:
        value = (value or "").strip()
        if value and not value.startswith("#"):
            raise serializers.ValidationError("Cor deve ser um hex começando com '#'.")
        return value or "#C7A444"
