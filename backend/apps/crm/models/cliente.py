"""
Modelo do cliente no funil de resgate (win-back).

Réplica do MVP (Lovable/Supabase), com as correções acordadas:
- `etapa` como TextChoices (slug + rótulo) em vez de texto livre;
- `meses_contrato` parametriza a parcela mensal (fim do "valor / 12" fixo);
- `criado_por` é apenas metadado/auditoria — a base é COMPARTILHADA pela equipe,
  então a visibilidade não é restrita por usuário (ver views/_helpers.py).
"""
from decimal import Decimal

from django.conf import settings
from django.db import models


class EtapaFunil(models.TextChoices):
    """As 7 etapas do funil de resgate, na ordem de progressão."""

    PRIORIZADO = "priorizado", "Priorizado"
    CONTATO_REALIZADO = "contato_realizado", "Contato Realizado"
    CONECTADO = "conectado", "Conectado"
    DIAGNOSTICO = "diagnostico", "Diagnóstico"
    PROPOSTA = "proposta", "Proposta"
    REATIVADO = "reativado", "Reativado"
    PERDIDO = "perdido", "Perdido"


class Cliente(models.Model):
    """Cliente/lead sendo trabalhado em um dos funis."""

    # Funil ao qual o cliente pertence (Indicados APN, Base Elite, Resgate...)
    funil = models.ForeignKey(
        "crm.Funil",
        on_delete=models.PROTECT,
        related_name="clientes",
        null=True,
        blank=True,
        db_index=True,
    )

    # Identificação
    nome = models.CharField("Nome / Empresa", max_length=200)
    cnpj = models.CharField(max_length=40, blank=True)
    email = models.EmailField(max_length=160, blank=True)
    telefone = models.CharField(max_length=40, blank=True)

    # Localização
    municipio = models.CharField("Município", max_length=120, blank=True)
    estado = models.CharField(max_length=40, blank=True)
    pais = models.CharField("País", max_length=60, blank=True)

    # Classificação comercial
    segmento = models.CharField(max_length=120, blank=True)
    canal = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=60, blank=True)
    produto_atual = models.CharField(max_length=120, blank=True)
    consultor_atual = models.CharField(max_length=120, blank=True)
    motivo_distrato = models.CharField(max_length=160, blank=True)

    # Responsável pelo resgate (texto livre, como no MVP — usado nos rankings)
    quem_fara_contato = models.CharField("Quem fará o contato", max_length=120, blank=True)
    responsavel = models.CharField(max_length=120, blank=True)

    # Indicação (relevante no funil "Indicados APN")
    indicador_nome = models.CharField("Indicado por", max_length=120, blank=True)
    indicador_empresa = models.CharField("Empresa do indicador", max_length=160, blank=True)
    indicador_whatsapp = models.CharField("WhatsApp do indicador", max_length=40, blank=True)
    indicador_equipe = models.CharField("Equipe do indicador", max_length=120, blank=True)
    faixa_faturamento = models.CharField("Faixa de faturamento", max_length=60, blank=True)
    prioridade = models.CharField("Prioridade", max_length=10, blank=True, help_text="P1 a P5")
    qtd_indicacoes = models.PositiveIntegerField("Qtd. de indicações do indicador", null=True, blank=True)

    # Datas / dados operacionais (texto para flexibilidade de importação, como no MVP)
    data_onboarding = models.CharField("Data de onboarding", max_length=40, blank=True)
    data_offboarding = models.CharField("Data de offboarding", max_length=40, blank=True)
    qtd_socios = models.PositiveIntegerField("Qtd. de sócios", null=True, blank=True)
    lt = models.CharField("LT", max_length=60, blank=True)

    # Funil
    etapa = models.CharField(
        max_length=30,
        choices=EtapaFunil.choices,
        null=True,
        blank=True,
        db_index=True,
        help_text="Etapa atual no funil. Vazio = fora do funil (só na base).",
    )
    ordem = models.IntegerField(default=0, help_text="Ordem dentro da coluna do Kanban.")
    notas = models.TextField(max_length=2000, blank=True)

    # Contrato recuperado (preenchido quando Reativado)
    valor_contrato = models.DecimalField(
        "Valor do contrato recuperado (R$)",
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    meses_contrato = models.PositiveSmallIntegerField(
        "Duração do contrato (meses)",
        null=True,
        blank=True,
        help_text="Parametriza a parcela mensal (valor ÷ meses). Vazio usa o padrão global.",
    )

    # Metadado / auditoria (NÃO usado para restringir visibilidade)
    criado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clientes_criados",
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "cliente"
        verbose_name_plural = "clientes"
        ordering = ("ordem", "nome")
        indexes = [
            models.Index(fields=["etapa"]),
            models.Index(fields=["quem_fara_contato"]),
        ]

    def __str__(self) -> str:
        return self.nome

    # === Regras de negócio ===
    @property
    def meses_efetivos(self) -> int:
        """Meses do contrato, caindo no padrão global quando não informado."""
        if self.meses_contrato and self.meses_contrato > 0:
            return self.meses_contrato
        return int(getattr(settings, "CRM_MESES_CONTRATO_PADRAO", 12)) or 12

    @property
    def parcela_mensal(self) -> Decimal:
        """Parcela mensal = valor do contrato ÷ meses efetivos."""
        if not self.valor_contrato:
            return Decimal("0")
        return (self.valor_contrato / Decimal(self.meses_efetivos)).quantize(Decimal("0.01"))

    @property
    def comissao_mensal(self) -> Decimal:
        """Comissão recorrente = parcela mensal × taxa global (default 3%)."""
        taxa = Decimal(str(getattr(settings, "CRM_COMISSAO_RATE", 0.03)))
        return (self.parcela_mensal * taxa).quantize(Decimal("0.01"))
