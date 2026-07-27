"""Admin do CRM — inspeção/curadoria da base (o CRUD real é pela API)."""
from django.contrib import admin, messages
from django.utils.html import format_html

from apps.crm.models import ApiKey, Cliente, Funil

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


@admin.register(ApiKey)
class ApiKeyAdmin(admin.ModelAdmin):
    """Emissão e revogação das chaves de integração.

    A chave em texto puro aparece UMA vez, como mensagem, logo após salvar —
    o banco só guarda o hash. Depois disso, só resta gerar outra.
    """

    list_display = ("nome", "prefixo", "usuario", "escopo", "situacao", "ultimo_uso_em", "criado_em")
    list_filter = ("escopo", "ativa")
    search_fields = ("nome", "prefixo", "usuario__username", "usuario__email")
    list_select_related = ("usuario",)
    actions = ("revogar",)

    def get_fields(self, request, obj=None):
        campos = ["nome", "usuario", "escopo", "expira_em", "ativa"]
        if obj is not None:
            campos += ["prefixo", "ultimo_uso_em", "criado_por", "criado_em"]
        return campos

    def get_readonly_fields(self, request, obj=None):
        if obj is None:
            return ()
        # Trocar o usuário de uma chave em uso mudaria silenciosamente em nome
        # de quem a integração age — bloqueado após a criação.
        return ("usuario", "prefixo", "ultimo_uso_em", "criado_por", "criado_em")

    def save_model(self, request, obj, form, change):
        if change:
            super().save_model(request, obj, form, change)
            return
        chave = obj.definir_nova_chave()
        obj.criado_por = request.user
        super().save_model(request, obj, form, change)
        self.message_user(
            request,
            format_html(
                "Chave de <b>{}</b> gerada. Copie agora — ela não será exibida de novo:"
                '<br><code style="user-select:all;font-size:13px">{}</code>',
                obj.nome, chave,
            ),
            level=messages.WARNING,
        )

    @admin.display(description="Situação")
    def situacao(self, obj):
        if not obj.ativa:
            return format_html('<span style="color:#C0392B;font-weight:600">revogada</span>')
        if obj.expirada:
            return format_html('<span style="color:#B7791F;font-weight:600">expirada</span>')
        return format_html('<span style="color:#2E7D5B;font-weight:600">ativa</span>')

    @admin.action(description="Revogar chaves selecionadas")
    def revogar(self, request, queryset):
        total = queryset.update(ativa=False)
        self.message_user(request, f"{total} chave(s) revogada(s).", level=messages.SUCCESS)
