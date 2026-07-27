"""Descarta a coluna antiga de etapa e promove a FK ao nome definitivo.

Parte 3 de 3. Roda depois da 0007, que já copiou os dados — a partir daqui
`Cliente.etapa` é a FK para `crm.Etapa`.
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0007_seed_etapas_por_funil"),
    ]

    operations = [
        # O índice era da CharField; a FK cria o seu próprio.
        migrations.RemoveIndex(
            model_name="cliente",
            name="crm_cliente_etapa_064831_idx",
        ),
        migrations.RemoveField(
            model_name="cliente",
            name="etapa",
        ),
        migrations.RenameField(
            model_name="cliente",
            old_name="etapa_nova",
            new_name="etapa",
        ),
    ]
