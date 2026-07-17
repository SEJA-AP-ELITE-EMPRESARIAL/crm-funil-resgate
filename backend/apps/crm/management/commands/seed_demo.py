"""
Popula o CRM com um usuário demo e uma carteira de exemplo.

    python manage.py seed_demo

Idempotente: usa get_or_create. Útil para subir o app e já ver o Kanban,
Dashboard e Comissionamento com dados.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.crm.models import Cliente, EtapaFunil, Funil

User = get_user_model()

DEMO_EMAIL = "demo@sejaap.com"
DEMO_USER = "demo"
DEMO_PASS = "demo12345"

# Funis iniciais (também criados pela migration 0003; get_or_create é idempotente).
FUNIS = [
    ("Indicados APN", "indicados_apn", "#3D7EC5", "Leads vindos de indicação (APN)", 1),
    ("Base Elite", "base_elite", "#C7A444", "Carteira Base Elite", 2),
    ("Resgate", "resgate", "#E77123", "Win-back de clientes cancelados", 3),
]

CLIENTES = [
    # nome, funil_slug, etapa, consultor, municipio, estado, motivo, valor, meses
    ("Prefeitura de Araçatuba", "resgate", EtapaFunil.REATIVADO, "Ana Souza", "Araçatuba", "SP", "Preço", Decimal("48000"), 12),
    ("Contabilidade Horizonte", "resgate", EtapaFunil.REATIVADO, "Bruno Lima", "Curitiba", "PR", "Sem uso", Decimal("24000"), 12),
    ("Mercado São João", "resgate", EtapaFunil.PROPOSTA, "Ana Souza", "Bauru", "SP", "Preço", None, None),
    ("Farmácia BemEstar", "resgate", EtapaFunil.PERDIDO, "Carla Dias", "Campinas", "SP", "Concorrente", None, None),
    ("Restaurante Sabor&Cia", "resgate", EtapaFunil.REATIVADO, "Carla Dias", "Ribeirão Preto", "SP", "Sem uso", Decimal("18000"), 6),
    ("Clínica VidaPlena", "base_elite", EtapaFunil.DIAGNOSTICO, "Carla Dias", "Londrina", "PR", "Atendimento", None, None),
    ("Auto Peças Central", "base_elite", EtapaFunil.CONECTADO, "Bruno Lima", "Maringá", "PR", "Concorrente", None, None),
    ("Construtora Alicerce", "base_elite", EtapaFunil.PRIORIZADO, "Ana Souza", "Osasco", "SP", "Preço", None, None),
    ("Escola Aprender+", "indicados_apn", EtapaFunil.CONTATO_REALIZADO, "Carla Dias", "Sorocaba", "SP", "Indicação", None, None),
    ("Transportadora RotaSul", "indicados_apn", EtapaFunil.PRIORIZADO, "Ana Souza", "Joinville", "SC", "Indicação", None, None),
    ("Padaria Pão Quente", "indicados_apn", EtapaFunil.REATIVADO, "Bruno Lima", "Blumenau", "SC", "Indicação", Decimal("9600"), 12),
]


class Command(BaseCommand):
    help = "Cria o usuário demo e garante os funis. Use --com-exemplos para popular carteira fictícia."

    def add_arguments(self, parser):
        parser.add_argument(
            "--com-exemplos",
            action="store_true",
            help="Também cria clientes fictícios (mockados) para demonstração.",
        )

    def handle(self, *args, **options):
        user, criado = User.objects.get_or_create(
            username=DEMO_USER,
            defaults={"email": DEMO_EMAIL, "is_staff": True, "is_superuser": True},
        )
        if criado:
            user.set_password(DEMO_PASS)
            user.save()
            self.stdout.write(self.style.SUCCESS(
                f"Usuário demo criado: {DEMO_USER} / {DEMO_PASS} (e-mail {DEMO_EMAIL})"
            ))
        else:
            # Garante acesso ao admin mesmo se o demo foi criado antes.
            if not (user.is_staff and user.is_superuser):
                user.is_staff = True
                user.is_superuser = True
                user.save(update_fields=["is_staff", "is_superuser"])
            self.stdout.write(f"Usuário demo já existe: {DEMO_USER} (admin garantido)")

        funis = {}
        for nome, slug, cor, desc, ordem in FUNIS:
            obj, _ = Funil.objects.get_or_create(
                slug=slug,
                defaults={"nome": nome, "cor": cor, "descricao": desc, "ordem": ordem},
            )
            funis[slug] = obj

        if not options.get("com_exemplos"):
            self.stdout.write(self.style.SUCCESS(
                f"{len(funis)} funis garantidos. (Sem clientes de exemplo — use --com-exemplos para popular.)"
            ))
            return

        novos = 0
        for i, (nome, funil_slug, etapa, consultor, mun, uf, motivo, valor, meses) in enumerate(CLIENTES):
            _, foi_criado = Cliente.objects.get_or_create(
                nome=nome,
                defaults={
                    "funil": funis.get(funil_slug),
                    "etapa": etapa or None,
                    "quem_fara_contato": consultor,
                    "municipio": mun,
                    "estado": uf,
                    "motivo_distrato": motivo,
                    "valor_contrato": valor,
                    "meses_contrato": meses,
                    "ordem": i,
                    "criado_por": user,
                },
            )
            novos += int(foi_criado)
        self.stdout.write(self.style.SUCCESS(f"{len(funis)} funis · {novos} cliente(s) de exemplo criados."))
