"""
Liga as contas locais às identidades do Conecta ID, casando por e-mail.

    python manage.py vincular_identidades --simular
    python manage.py vincular_identidades
    python manage.py vincular_identidades --criar-faltantes

Roda ANTES de virar a chave (`AUTH_CENTRAL_ATIVO`), e roda quantas vezes for
preciso: é idempotente. Enquanto a chave estiver desligada, vincular não muda
nada para ninguém — só prepara o terreno.

`--simular` é o modo padrão de quem tem juízo: mostra exatamente o que faria sem
gravar nada. O relatório de quem NÃO casou é a parte que importa, porque é essa
gente que ficaria sem conseguir entrar depois do corte.
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.crm.models import VinculoIdentidade
from identidade_client import ClienteIdentidade, EmailEmUso, ErroIdentidade

APP = "crm"


class Command(BaseCommand):
    help = "Vincula usuários locais às identidades do Conecta ID (por e-mail)."

    def add_arguments(self, parser):
        parser.add_argument("--simular", action="store_true", help="Não grava nada.")
        parser.add_argument(
            "--criar-faltantes",
            action="store_true",
            help="Cria no Conecta ID quem não existir lá, já com acesso a este app.",
        )

    def handle(self, *args, **opcoes):
        simular = opcoes["simular"]
        criar = opcoes["criar_faltantes"]
        cliente = ClienteIdentidade()

        Usuario = get_user_model()
        vinculados, novos, sem_email, nao_encontrados, erros = 0, 0, [], [], []

        for usuario in Usuario.objects.filter(is_active=True).order_by("username"):
            if VinculoIdentidade.objects.filter(usuario=usuario).exists():
                continue

            email = (usuario.email or "").strip().lower()
            if not email:
                # Sem e-mail não há como casar: o e-mail é o login no Conecta ID.
                sem_email.append(usuario.get_username())
                continue

            try:
                identidade = cliente.buscar_por_email(email)
                if identidade is None and criar:
                    identidade = self._criar(cliente, usuario, email, simular)
                    if identidade:
                        novos += 1
            except ErroIdentidade as erro:
                erros.append(f"{usuario.get_username()}: {erro}")
                continue

            if identidade is None:
                nao_encontrados.append(f"{usuario.get_username()} <{email}>")
                continue

            if not simular:
                VinculoIdentidade.objects.get_or_create(
                    usuario=usuario,
                    defaults={"identidade_id": identidade["identidade_id"]},
                )
            vinculados += 1
            self.stdout.write(
                f"  {usuario.get_username():30} -> {identidade['identidade_id']}"
            )

        self._relatorio(simular, vinculados, novos, sem_email, nao_encontrados, erros)

    def _criar(self, cliente, usuario, email, simular):
        nome = usuario.get_full_name() or usuario.get_username()
        if simular:
            self.stdout.write(f"  [simulação] criaria identidade para {email}")
            return None
        try:
            # O CRM não tem `pode_gerir_identidades`, então só consegue conceder
            # acesso a SI MESMO — que é exatamente o que se quer aqui. Pedir
            # outro app devolveria `sem_permissao` do serviço.
            return cliente.criar(email, nome, apps=[APP])
        except EmailEmUso as erro:
            # Corrida com outra execução, ou e-mail já usado por outra conta.
            return {"identidade_id": erro.identidade_id}

    def _relatorio(self, simular, vinculados, novos, sem_email, nao_encontrados, erros):
        self.stdout.write("")
        modo = "SIMULAÇÃO — nada foi gravado" if simular else "aplicado"
        self.stdout.write(
            self.style.SUCCESS(
                f"{modo}: {vinculados} vínculo(s), {novos} identidade(s) criada(s)"
            )
        )

        if sem_email:
            self.stdout.write(
                self.style.WARNING(f"\nSem e-mail ({len(sem_email)}) — resolver na mão:")
            )
            for nome in sem_email:
                self.stdout.write(f"  - {nome}")

        if nao_encontrados:
            self.stdout.write(
                self.style.WARNING(
                    f"\nSem identidade no Conecta ID ({len(nao_encontrados)}) — "
                    "ESTA GENTE NÃO ENTRA depois do corte:"
                )
            )
            for nome in nao_encontrados:
                self.stdout.write(f"  - {nome}")
            self.stdout.write("  (rode com --criar-faltantes para criá-las já com acesso)")

        if erros:
            self.stdout.write(self.style.ERROR(f"\nErros ({len(erros)}):"))
            for erro in erros:
                self.stdout.write(f"  - {erro}")
