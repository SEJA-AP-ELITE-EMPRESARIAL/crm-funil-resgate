"""
Funil de vendas/relacionamento.

Nasceu com 3 (Indicados APN, Base Elite, Resgate). O modelo é uma TABELA
(gerenciável no admin) para permitir criar/renomear/desativar funis sem migration.

**Cada funil tem as próprias colunas** (`related_name="etapas"`, ver
models/etapa.py) — o que era uma evolução prevista e foi feita em 2026-07-27.
As colunas do Kanban se resolvem pelo funil selecionado; um funil pode
legitimamente não ter nenhuma (é o estado inicial de um funil recém-criado).

Desde 2026-08-20 o funil também se cria pela interface, e não só pelo admin
(TSK-146): `slug` e `ordem` são derivados aqui, do mesmo jeito que em Etapa,
para que a tela precise pedir apenas o nome.
"""
from django.db import models
from django.utils.text import slugify


class Funil(models.Model):
    nome = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    cor = models.CharField(
        max_length=9,
        default="#C7A444",
        help_text="Cor do selo do funil (hex, ex.: #3D7EC5).",
    )
    descricao = models.CharField(max_length=200, blank=True)
    ativo = models.BooleanField(default=True)
    ordem = models.PositiveSmallIntegerField(default=0)

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "funil"
        verbose_name_plural = "funis"
        ordering = ("ordem", "nome")

    def __str__(self) -> str:
        return self.nome

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = self.gerar_slug(self.nome)
        super().save(*args, **kwargs)

    @classmethod
    def gerar_slug(cls, nome: str) -> str:
        """Slug único no quadro — acrescenta sufixo se já existir."""
        base = slugify(nome).replace("-", "_")[:75] or "funil"
        slug, n = base, 2
        while cls.objects.filter(slug=slug).exists():
            slug = f"{base}_{n}"
            n += 1
        return slug

    @classmethod
    def proxima_ordem(cls) -> int:
        ultimo = cls.objects.order_by("-ordem").first()
        return (ultimo.ordem + 1) if ultimo else 0
