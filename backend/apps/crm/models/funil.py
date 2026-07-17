"""
Funil de vendas/relacionamento.

Hoje há 3 (Indicados APN, Base Elite, Resgate) e todos compartilham as mesmas
etapas (EtapaFunil). O modelo é uma TABELA (gerenciável no admin) para permitir
criar/renomear/desativar funis sem migration.

Evolução futura prevista: dar etapas próprias por funil. Quando isso for
necessário, adicionar aqui um relacionamento de etapas (ex.: modelo EtapaCustom
com FK para Funil) e passar a resolver as colunas do Kanban pelo funil.
"""
from django.db import models


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
