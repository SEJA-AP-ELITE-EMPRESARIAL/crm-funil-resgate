"""Cria o modelo Etapa (coluna por funil) e o campo temporário no Cliente.

Parte 1 de 3 da troca de `Cliente.etapa` (CharField com choices globais) para FK.
O campo entra com nome provisório `etapa_nova` para que a 0007 possa copiar os
dados antes de a 0008 descartar a coluna antiga.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0005_apikey"),
    ]

    operations = [
        migrations.CreateModel(
            name="Etapa",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("nome", models.CharField(max_length=60)),
                ("slug", models.SlugField(help_text="Identificador estável, usado pela API e pela importação.", max_length=60)),
                ("emoji", models.CharField(blank=True, help_text="Ícone exibido antes do nome da coluna (opcional).", max_length=8)),
                ("cor", models.CharField(default="#C7A444", help_text="Cor da coluna e do selo (hex, ex.: #E4B744).", max_length=9)),
                ("ordem", models.PositiveSmallIntegerField(default=0)),
                (
                    "tipo",
                    models.CharField(
                        choices=[
                            ("progressao", "Progressão"),
                            ("ganho", "Ganho"),
                            ("perda", "Perda"),
                            ("auxiliar", "Auxiliar"),
                        ],
                        default="progressao",
                        help_text="Define como a etapa entra nos indicadores do Dashboard.",
                        max_length=12,
                    ),
                ),
                ("criado_em", models.DateTimeField(auto_now_add=True)),
                ("atualizado_em", models.DateTimeField(auto_now=True)),
                (
                    "funil",
                    models.ForeignKey(
                        help_text="Funil dono desta coluna.",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="etapas",
                        to="crm.funil",
                    ),
                ),
            ],
            options={
                "verbose_name": "etapa",
                "verbose_name_plural": "etapas",
                "ordering": ("ordem", "id"),
            },
        ),
        migrations.AddConstraint(
            model_name="etapa",
            constraint=models.UniqueConstraint(fields=("funil", "slug"), name="etapa_slug_unica_por_funil"),
        ),
        migrations.AddField(
            model_name="cliente",
            name="etapa_nova",
            field=models.ForeignKey(
                blank=True,
                help_text="Coluna atual no Kanban. Vazio = fora do funil (só na base).",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="clientes",
                to="crm.etapa",
            ),
        ),
    ]
