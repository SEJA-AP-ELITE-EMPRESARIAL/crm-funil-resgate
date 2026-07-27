"""Serializers da Etapa (coluna do Kanban)."""
from rest_framework import serializers

from apps.crm.models import Etapa


class EtapaSerializer(serializers.ModelSerializer):
    """Saída — inclui o rótulo pronto (emoji + nome) e a contagem de clientes."""

    rotulo = serializers.CharField(read_only=True)
    total_clientes = serializers.IntegerField(source="clientes.count", read_only=True)

    class Meta:
        model = Etapa
        fields = [
            "id", "funil", "nome", "slug", "emoji", "cor", "ordem", "tipo",
            "rotulo", "total_clientes",
        ]
        read_only_fields = fields


class EtapaWriteSerializer(serializers.ModelSerializer):
    """Entrada — `slug` e `ordem` são derivados quando não informados."""

    class Meta:
        model = Etapa
        fields = ["funil", "nome", "emoji", "cor", "ordem", "tipo"]
        extra_kwargs = {
            # `funil` só é obrigatório na criação; no PATCH a coluna não troca de funil.
            "funil": {"required": True},
        }

    def validate_nome(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Nome da coluna é obrigatório.")
        return value

    def validate_cor(self, value: str) -> str:
        value = (value or "").strip()
        if value and not value.startswith("#"):
            raise serializers.ValidationError("Cor deve ser um hex começando com '#'.")
        return value or "#C7A444"

    def validate(self, attrs):
        """Nome duplicado dentro do mesmo funil confunde mais do que ajuda."""
        funil = attrs.get("funil") or getattr(self.instance, "funil", None)
        nome = attrs.get("nome") or getattr(self.instance, "nome", None)
        if funil and nome:
            existentes = Etapa.objects.filter(funil=funil, nome__iexact=nome)
            if self.instance:
                existentes = existentes.exclude(pk=self.instance.pk)
            if existentes.exists():
                raise serializers.ValidationError(
                    {"nome": "Já existe uma coluna com esse nome neste funil."}
                )
        return attrs
