"""
Helpers das views do CRM.

CORREÇÃO-CHAVE em relação ao MVP: a base é COMPARTILHADA pela equipe.
Qualquer usuário autenticado enxerga e trabalha toda a base — não há filtro
por `criado_por`. Isso conserta o RLS quebrado do MVP (que restringia por
usuário e deixava o board vazio para quem não cadastrou os registros).

Se um dia o CRM entrar no ConectaAP como módulo, este é o ponto único onde
trocar `Cliente.objects.all()` por `filter(cliente__in=user.get_clientes_visiveis())`.
"""
from apps.crm.models import Cliente


def clientes_base():
    """QuerySet base — toda a carteira, visível para toda a equipe autenticada."""
    return Cliente.objects.select_related("criado_por", "funil").all()
