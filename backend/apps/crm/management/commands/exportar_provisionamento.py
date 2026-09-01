"""
Exporta o que cada pessoa é DENTRO do CRM, para o Conecta ID guardar.

    python manage.py exportar_provisionamento > crm.json

Só leitura: não toca em conta nenhuma, aqui nem lá. O arquivo é consumido pelo
`importar_provisionamento` do Conecta ID, que grava a configuração dos acessos.

Este app **não pode** escrever a própria configuração pela API: `PATCH /acessos`
exige `pode_gerir_identidades`, que ele não tem — e não deveria ter, porque a
flag também libera editar qualquer identidade e enxergar a base inteira. Daí o
backfill ser exportação de um lado e importação do outro.

O CRM não tem hierarquia de papéis; o único recorte é quem administra o Django
daqui. `is_superuser` fica de fora de propósito, como em todo o resto desta
integração: ele passa por cima de toda checagem de permissão, e não se descreve
nem se concede isso por um campo de texto noutro sistema.
"""
import json

from django.core.management.base import BaseCommand

from apps.crm.models import VinculoIdentidade


class Command(BaseCommand):
    help = "Exporta o is_staff de cada conta vinculada, em JSON, para o Conecta ID."

    def add_arguments(self, parser):
        parser.add_argument(
            "--incluir-inativos",
            action="store_true",
            help="Também exporta contas desativadas aqui. Fora por padrão.",
        )

    def handle(self, *args, **opcoes):
        vinculos = VinculoIdentidade.objects.select_related("usuario").order_by(
            "usuario__email"
        )
        if not opcoes["incluir_inativos"]:
            vinculos = vinculos.filter(usuario__is_active=True)

        itens = [
            {
                "identidade_id": str(vinculo.identidade_id),
                "email": vinculo.usuario.email,
                "configuracao": configuracao_de(vinculo.usuario),
            }
            for vinculo in vinculos
        ]

        self.stdout.write(
            json.dumps({"app": "crm", "itens": itens}, ensure_ascii=False, indent=2)
        )
        self.stderr.write(f"{len(itens)} conta(s) exportada(s).")


def configuracao_de(usuario):
    """O que esta pessoa é no CRM, na forma que o Conecta ID guarda.

    `staff=False` é exportado, e não omitido: ele é a descrição fiel de quem só
    vê o funil. Omitir faria o admin mostrar "—" e deixar no ar a dúvida entre
    "não administra" e "ninguém preencheu".
    """
    return {"staff": bool(usuario.is_staff)}
