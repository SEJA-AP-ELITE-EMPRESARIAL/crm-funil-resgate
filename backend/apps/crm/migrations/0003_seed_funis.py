"""
Cria os 3 funis iniciais e vincula os clientes existentes.

- Reversível de forma segura (remove os funis criados; volta clientes a funil nulo).
- Os clientes já existentes (dados do MVP/seed) são atribuídos ao funil Resgate,
  exceto uma seleção de exemplo distribuída para os outros funis, para a visão
  "Todos" já nascer com variedade.
"""
from django.db import migrations

FUNIS = [
    ("Indicados APN", "indicados_apn", "#3D7EC5", "Leads vindos de indicação (APN)", 1),
    ("Base Elite", "base_elite", "#C7A444", "Carteira Base Elite", 2),
    ("Resgate", "resgate", "#E77123", "Win-back de clientes cancelados", 3),
]

# Distribuição de exemplo (nome do cliente -> slug do funil). Demais -> resgate.
EXEMPLOS = {
    "Clínica VidaPlena": "base_elite",
    "Auto Peças Central": "base_elite",
    "Construtora Alicerce": "base_elite",
    "Escola Aprender+": "indicados_apn",
    "Transportadora RotaSul": "indicados_apn",
    "Padaria Pão Quente": "indicados_apn",
}


def criar_funis(apps, schema_editor):
    Funil = apps.get_model("crm", "Funil")
    Cliente = apps.get_model("crm", "Cliente")

    por_slug = {}
    for nome, slug, cor, desc, ordem in FUNIS:
        obj, _ = Funil.objects.get_or_create(
            slug=slug,
            defaults={"nome": nome, "cor": cor, "descricao": desc, "ordem": ordem},
        )
        por_slug[slug] = obj

    resgate = por_slug["resgate"]
    for cliente in Cliente.objects.all():
        slug = EXEMPLOS.get(cliente.nome, "resgate")
        cliente.funil = por_slug.get(slug, resgate)
        cliente.save(update_fields=["funil"])


def desfazer(apps, schema_editor):
    Funil = apps.get_model("crm", "Funil")
    Cliente = apps.get_model("crm", "Cliente")
    Cliente.objects.update(funil=None)
    Funil.objects.filter(slug__in=[f[1] for f in FUNIS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("crm", "0002_funil_cliente_funil"),
    ]
    operations = [
        migrations.RunPython(criar_funis, desfazer),
    ]
