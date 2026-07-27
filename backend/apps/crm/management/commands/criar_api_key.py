"""
Emite uma chave de API pela linha de comando (útil na VPS, sem passar pelo admin).

    python manage.py criar_api_key "n8n — sync diária" --usuario integracao
    python manage.py criar_api_key "Dashboard externo" --usuario integracao \
        --escopo escrita --dias 90

A chave é impressa uma única vez; o banco guarda só o hash.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.crm.models import ApiKey, EscopoApiKey

User = get_user_model()


class Command(BaseCommand):
    help = "Cria uma chave de API para integração externa."

    def add_arguments(self, parser):
        parser.add_argument("nome", help="Identificação da chave (ex.: 'n8n — sync diária').")
        parser.add_argument(
            "--usuario",
            required=True,
            help="Username ou e-mail do usuário em nome de quem a chave age.",
        )
        parser.add_argument(
            "--escopo",
            default=EscopoApiKey.LEITURA,
            choices=[e.value for e in EscopoApiKey],
            help="leitura (padrão) ou escrita.",
        )
        parser.add_argument("--dias", type=int, help="Validade em dias. Omitido = não expira.")

    def handle(self, *args, **options):
        login = options["usuario"]
        usuario = User.objects.filter(username=login).first() or User.objects.filter(email__iexact=login).first()
        if usuario is None:
            raise CommandError(f"Usuário '{login}' não encontrado.")

        expira_em = None
        if options.get("dias"):
            expira_em = timezone.now() + timedelta(days=options["dias"])

        api_key, chave = ApiKey.gerar(
            nome=options["nome"],
            usuario=usuario,
            escopo=options["escopo"],
            expira_em=expira_em,
        )

        validade = expira_em.strftime("%d/%m/%Y") if expira_em else "sem expiração"
        self.stdout.write(self.style.SUCCESS(f"Chave '{api_key.nome}' criada."))
        self.stdout.write(f"  usuário: {usuario.get_username()}   escopo: {api_key.escopo}   validade: {validade}")
        self.stdout.write(self.style.WARNING("  Copie agora — não será exibida de novo:"))
        self.stdout.write(f"\n  {chave}\n")
