"""Admin do CRM — inspeção/curadoria da base (o CRUD real é pela API)."""
from django.contrib import admin
from django.utils.html import format_html

from apps.crm.models import Cliente, Funil

# Cores das etapas (espelham o design system do funil).
_ETAPA_CORES = {
    "priorizado": "#E4B744",
    "contato_realizado": "#EA932E",
    "conectado": "#E77123",
    "diagnostico": "#DF5B3A",
    "proposta": "#B069D3",
    "reativado": "#31C47F",
    "perdido": "#666666",
}


@admin.register(Funil)
class FunilAdmin(admin.ModelAdmin):
    list_display = ("nome", "slug", "cor_badge", "ativo", "ordem", "total_clientes")
    list_editable = ("ativo", "ordem")
    prepopulated_fields = {"slug": ("nome",)}
    search_fields = ("nome", "slug")

    @admin.display(description="Cor")
    def cor_badge(self, obj):
        return format_html(
            '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;'
            'background:{};border:1px solid rgba(0,0,0,.2)"></span> {}',
            obj.cor, obj.cor,
        )

    @admin.display(description="Clientes")
    def total_clientes(self, obj):
        return obj.clientes.count()


@admin.register(Cliente)
class ClienteAdmin(admin.ModelAdmin):
    list_display = (
        "nome",
        "funil",
        "etapa_badge",
        "quem_fara_contato",
        "municipio",
        "estado",
        "valor_contrato_fmt",
        "comissao_fmt",
        "atualizado_em",
    )
    list_filter = ("funil", "etapa", "quem_fara_contato", "estado", "segmento", "motivo_distrato")
    search_fields = ("nome", "cnpj", "email", "quem_fara_contato", "municipio")
    list_select_related = ("criado_por", "funil")
    date_hierarchy = "criado_em"
    ordering = ("ordem", "nome")
    readonly_fields = ("criado_em", "atualizado_em", "criado_por")
    list_per_page = 50

    fieldsets = (
        ("Identificação", {"fields": ("nome", "cnpj", "email", "telefone")}),
        ("Localização", {"fields": ("municipio", "estado", "pais")}),
        ("Comercial", {"fields": (
            "segmento", "canal", "status", "produto_atual", "consultor_atual",
            "motivo_distrato", "quem_fara_contato", "responsavel",
        )}),
        ("Operacional", {"fields": ("data_onboarding", "data_offboarding", "qtd_socios", "lt")}),
        ("Funil", {"fields": ("funil", "etapa", "ordem", "notas")}),
        ("Contrato recuperado", {"fields": ("valor_contrato", "meses_contrato")}),
        ("Metadados", {"fields": ("criado_por", "criado_em", "atualizado_em")}),
    )

    @admin.display(description="Etapa", ordering="etapa")
    def etapa_badge(self, obj):
        if not obj.etapa:
            return format_html('<span style="color:#999">—</span>')
        cor = _ETAPA_CORES.get(obj.etapa, "#666")
        return format_html(
            '<span style="background:{}22;color:{};border:1px solid {}55;'
            'padding:2px 8px;border-radius:6px;font-weight:600;font-size:11px">{}</span>',
            cor, cor, cor, obj.get_etapa_display(),
        )

    @admin.display(description="Valor contrato", ordering="valor_contrato")
    def valor_contrato_fmt(self, obj):
        if not obj.valor_contrato:
            return "—"
        return f"R$ {obj.valor_contrato:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

    @admin.display(description="Comissão/mês")
    def comissao_fmt(self, obj):
        if not obj.valor_contrato:
            return "—"
        return f"R$ {obj.comissao_mensal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
