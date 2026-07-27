"""
Etapa (coluna do Kanban) — pertence a UM funil.

Antes as etapas eram um TextChoices global, iguais para os três funis. Isso
deixou de servir quando cada funil passou a ter o próprio fluxo: o Indicados APN
tem "Inscrito" (a pessoa entrou na turma), enquanto um funil de win-back termina
em "Reativado". Agora cada funil define as suas colunas, criáveis pela interface.

O `tipo` é o que permite o Dashboard continuar entendendo o funil sem nomes
fixos: as etapas de PROGRESSAO formam a esteira, GANHO a fecha, PERDA sai dela e
AUXILIAR fica de lado (ex.: "Follow-up", que não é avanço nem perda).
"""
from django.db import models
from django.utils.text import slugify


class TipoEtapa(models.TextChoices):
    PROGRESSAO = "progressao", "Progressão"
    GANHO = "ganho", "Ganho"
    PERDA = "perda", "Perda"
    AUXILIAR = "auxiliar", "Auxiliar"


class Etapa(models.Model):
    funil = models.ForeignKey(
        "crm.Funil",
        on_delete=models.CASCADE,
        related_name="etapas",
        help_text="Funil dono desta coluna.",
    )
    nome = models.CharField(max_length=60)
    slug = models.SlugField(
        max_length=60,
        help_text="Identificador estável, usado pela API e pela importação.",
    )
    emoji = models.CharField(
        max_length=8,
        blank=True,
        help_text="Ícone exibido antes do nome da coluna (opcional).",
    )
    cor = models.CharField(
        max_length=9,
        default="#C7A444",
        help_text="Cor da coluna e do selo (hex, ex.: #E4B744).",
    )
    ordem = models.PositiveSmallIntegerField(default=0)
    tipo = models.CharField(
        max_length=12,
        choices=TipoEtapa.choices,
        default=TipoEtapa.PROGRESSAO,
        help_text="Define como a etapa entra nos indicadores do Dashboard.",
    )

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "etapa"
        verbose_name_plural = "etapas"
        ordering = ("ordem", "id")
        constraints = [
            models.UniqueConstraint(fields=["funil", "slug"], name="etapa_slug_unica_por_funil"),
        ]

    def __str__(self) -> str:
        return f"{self.funil.nome} · {self.nome}"

    @property
    def rotulo(self) -> str:
        """Nome com o emoji na frente, quando houver."""
        return f"{self.emoji} {self.nome}".strip()

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self.gerar_slug(self.funil_id, self.nome)
        super().save(*args, **kwargs)

    @classmethod
    def gerar_slug(cls, funil_id, nome: str) -> str:
        """Slug único dentro do funil — acrescenta sufixo se já existir."""
        base = slugify(nome).replace("-", "_")[:55] or "etapa"
        slug, n = base, 2
        while cls.objects.filter(funil_id=funil_id, slug=slug).exists():
            slug = f"{base}_{n}"
            n += 1
        return slug

    @classmethod
    def proxima_ordem(cls, funil_id) -> int:
        ultima = cls.objects.filter(funil_id=funil_id).order_by("-ordem").first()
        return (ultima.ordem + 1) if ultima else 0
