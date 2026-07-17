"""
Serializers DRF do CRM.

Convenção do ConectaAP: leitura e escrita separadas. O de leitura expõe campos
derivados (rótulo da etapa, parcela e comissão calculadas); o de escrita valida
apenas o shape — `criado_por` é injetado pela view.
"""
from rest_framework import serializers

from apps.crm.models import Cliente

# Campos editáveis via API (excluem metadados e derivados).
_EDITAVEIS = [
    "funil",
    "nome", "cnpj", "email", "telefone",
    "municipio", "estado", "pais",
    "segmento", "canal", "status", "produto_atual", "consultor_atual", "motivo_distrato",
    "quem_fara_contato", "responsavel",
    "indicador_nome", "indicador_empresa", "indicador_whatsapp", "indicador_equipe",
    "faixa_faturamento", "prioridade", "qtd_indicacoes",
    "data_onboarding", "data_offboarding", "qtd_socios", "lt",
    "etapa", "ordem", "notas",
    "valor_contrato", "meses_contrato",
]


class ClienteSerializer(serializers.ModelSerializer):
    """Saída (read-only) — inclui campos derivados de negócio."""

    etapa_display = serializers.CharField(source="get_etapa_display", read_only=True)
    funil_nome = serializers.CharField(source="funil.nome", read_only=True, default=None)
    funil_slug = serializers.CharField(source="funil.slug", read_only=True, default=None)
    funil_cor = serializers.CharField(source="funil.cor", read_only=True, default=None)
    parcela_mensal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    comissao_mensal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    meses_efetivos = serializers.IntegerField(read_only=True)
    criado_por_nome = serializers.CharField(
        source="criado_por.get_username", read_only=True, default=None
    )

    class Meta:
        model = Cliente
        fields = [
            "id", *_EDITAVEIS,
            "etapa_display", "funil_nome", "funil_slug", "funil_cor",
            "parcela_mensal", "comissao_mensal", "meses_efetivos",
            "criado_por", "criado_por_nome", "criado_em", "atualizado_em",
        ]
        read_only_fields = fields


class ClienteWriteSerializer(serializers.ModelSerializer):
    """Entrada (create/update)."""

    class Meta:
        model = Cliente
        fields = _EDITAVEIS

    def validate_nome(self, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise serializers.ValidationError("Nome é obrigatório.")
        return value

    def validate_valor_contrato(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Valor do contrato não pode ser negativo.")
        return value

    def validate_meses_contrato(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Duração do contrato deve ser maior que zero.")
        return value
