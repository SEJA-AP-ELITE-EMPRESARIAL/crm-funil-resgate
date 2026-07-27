"""Semeia as colunas do Indicados APN e migra os clientes para a FK.

Parte 2 de 3. Em produção só o Indicados APN tem clientes (235, distribuídos em
priorizado/contato_realizado/conectado/perdido) — Base Elite e Resgate ficam
propositalmente **sem colunas**, para serem desenhados pela interface.

Nada é descartado: se algum ambiente tiver clientes numa etapa antiga sem
equivalente no fluxo novo (ex.: "Diagnóstico"), a coluna é recriada naquele
funil como AUXILIAR, preservando nome e cor originais. Em produção isso não
dispara nenhuma vez.
"""
from django.db import migrations

# Fluxo novo do Indicados APN, na ordem do Kanban.
ETAPAS_INDICADOS_APN = [
    # slug,               nome,                emoji, cor,        tipo
    ("priorizado",        "Priorizado",        "🟡",  "#E4B744", "progressao"),
    ("primeiro_contato",  "Primeiro Contato",  "🪪",  "#EA932E", "progressao"),
    ("em_conversa",       "Em Conversa",       "💬",  "#E77123", "progressao"),
    ("interessado",       "Interessado",       "🔥",  "#DF5B3A", "progressao"),
    ("negociacao",        "Negociação",        "🟠",  "#B069D3", "progressao"),
    ("inscrito",          "Inscrito",          "✅",  "#31C47F", "ganho"),
    ("follow_up",         "Follow-up",         "🔁",  "#3D7EC5", "auxiliar"),
    ("encerrado",         "Encerrado",         "❌",  "#666666", "perda"),
]

# Etapa antiga (global) -> slug da etapa nova, dentro do Indicados APN.
DE_PARA_INDICADOS_APN = {
    "priorizado": "priorizado",
    "contato_realizado": "primeiro_contato",
    "conectado": "em_conversa",
    "proposta": "negociacao",
    "reativado": "inscrito",
    "perdido": "encerrado",
    # "diagnostico" não tem equivalente — vira coluna legada (ver _coluna_legada).
}

# Nome e cor das etapas antigas, para recriar as que não têm equivalente.
LEGADAS = {
    "priorizado": ("Priorizado", "#E4B744"),
    "contato_realizado": ("Contato Realizado", "#EA932E"),
    "conectado": ("Conectado", "#E77123"),
    "diagnostico": ("Diagnóstico", "#DF5B3A"),
    "proposta": ("Proposta", "#B069D3"),
    "reativado": ("Reativado", "#31C47F"),
    "perdido": ("Perdido", "#666666"),
}


def _coluna_legada(Etapa, funil_id, slug_antigo):
    """Recria uma etapa antiga no funil, preservando nome e cor."""
    nome, cor = LEGADAS.get(slug_antigo, (slug_antigo.replace("_", " ").title(), "#C7A444"))
    etapa, criada = Etapa.objects.get_or_create(
        funil_id=funil_id,
        slug=slug_antigo,
        defaults={"nome": nome, "cor": cor, "tipo": "auxiliar", "ordem": 90},
    )
    return etapa


def semear(apps, schema_editor):
    Funil = apps.get_model("crm", "Funil")
    Etapa = apps.get_model("crm", "Etapa")
    Cliente = apps.get_model("crm", "Cliente")

    apn = Funil.objects.filter(slug="indicados_apn").first()
    por_funil_e_slug = {}

    if apn:
        for ordem, (slug, nome, emoji, cor, tipo) in enumerate(ETAPAS_INDICADOS_APN):
            etapa, _ = Etapa.objects.get_or_create(
                funil_id=apn.id,
                slug=slug,
                defaults={"nome": nome, "emoji": emoji, "cor": cor, "ordem": ordem, "tipo": tipo},
            )
            por_funil_e_slug[(apn.id, slug)] = etapa

    # Migra os clientes. Sem funil ou sem etapa antiga => fica fora do board.
    for cliente in Cliente.objects.exclude(etapa="").exclude(etapa=None).iterator():
        if not cliente.funil_id:
            continue

        antigo = cliente.etapa
        if apn and cliente.funil_id == apn.id:
            novo_slug = DE_PARA_INDICADOS_APN.get(antigo)
            if novo_slug:
                etapa = por_funil_e_slug[(apn.id, novo_slug)]
            else:
                etapa = _coluna_legada(Etapa, cliente.funil_id, antigo)
        else:
            # Outros funis não recebem o fluxo do APN; preserva o que existir.
            chave = (cliente.funil_id, antigo)
            if chave not in por_funil_e_slug:
                por_funil_e_slug[chave] = _coluna_legada(Etapa, cliente.funil_id, antigo)
            etapa = por_funil_e_slug[chave]

        Cliente.objects.filter(pk=cliente.pk).update(etapa_nova_id=etapa.id)


def desfazer(apps, schema_editor):
    """Solta os clientes das colunas e remove as etapas criadas (FK é PROTECT)."""
    Etapa = apps.get_model("crm", "Etapa")
    Cliente = apps.get_model("crm", "Cliente")
    Cliente.objects.update(etapa_nova=None)
    Etapa.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ("crm", "0006_etapa"),
    ]

    operations = [
        migrations.RunPython(semear, desfazer),
    ]
