"""
Operações de senha quando o login central está ativo.

Existe para um erro específico não acontecer: com o Conecta ID ligado, gravar
`set_password` no usuário local é uma operação que **funciona e não faz nada** —
a pessoa troca a senha, o sistema confirma, e no login seguinte a senha antiga
continua valendo porque quem responde é o serviço central.

O CRM nunca teve tela de senha nenhuma: quem esquecia a senha pedia a um admin,
que trocava pelo `/admin/` do Django. Com a senha morando fora, isso deixa de
funcionar — daí estes três caminhos.

## O que o CRM NÃO faz

Gerar link de definição de senha **e receber o token**. O serviço só devolve o
token para aplicações com `pode_gerir_identidades`, e essa é só o kanban. Não é
limitação acidental: ter o token em mãos é poder sobre a conta de outra pessoa,
e esse poder mora num lugar só, de propósito.

O que o CRM ganhou em 28/08/2026 foi `pedir_link`, que é outra coisa: ele manda
o Conecta ID **enviar** o link por e-mail, para o endereço da própria pessoa. O
token não passa por aqui em momento nenhum, e a resposta é a mesma para
qualquer endereço — inclusive um que não existe. É por isso que essa porta pode
ficar aberta a um app comum enquanto a outra continua fechada.

Espelhado de `conecta-kanban/apps/contas/identidade_senha.py`.
"""
from identidade_client import (
    ClienteIdentidade,
    CredencialInvalida,
    ErroIdentidade,
    IdentidadeIndisponivel,
    SenhaFraca,
    TokenInvalido,
    central_ativa,
)


def usa_central(usuario):
    """A senha desta conta mora no Conecta ID?

    Duas condições: a integração ligada E a conta já vinculada. Durante a
    transição as duas coisas convivem — quem ainda não tem vínculo continua no
    caminho local, e é isso que permite virar a chave sem esperar todo mundo.
    """
    if not central_ativa():
        return False
    return hasattr(usuario, "vinculo_identidade")


def identidade_de(usuario):
    return usuario.vinculo_identidade.identidade_id


def ip_do_request(request):
    """IP do usuário final, para a auditoria e o bloqueio por origem do serviço.

    Atrás do nginx do host o que vale é o X-Forwarded-For; o REMOTE_ADDR seria
    sempre o do proxy, e o bloqueio por IP viraria bloqueio geral.
    """
    if request is None:
        return None
    encaminhado = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def trocar(usuario, senha_atual, senha_nova, ip=None):
    ClienteIdentidade().trocar_senha(
        identidade_de(usuario), senha_atual, senha_nova, ip=ip
    )


def definir_por_token(token, senha_nova):
    """Consome o token de uso único e grava a senha."""
    ClienteIdentidade().definir_senha(token, senha_nova)


def pedir_link(email):
    """Pede ao Conecta ID que envie o link de senha para este endereço.

    Não devolve nada, e não é omissão: o serviço responde 202 para qualquer
    e-mail, exista conta nele ou não. Quem chama daqui não tem — e não deve
    ter — como distinguir os casos.

    O teto de pedidos por hora é do Conecta ID, contado por e-mail e válido
    para todos os apps juntos. Repetir a contagem aqui não somaria proteção:
    quem quisesse encher a caixa de alguém trocaria de app.
    """
    ClienteIdentidade().esqueci_senha(email)


__all__ = [
    "CredencialInvalida",
    "ErroIdentidade",
    "IdentidadeIndisponivel",
    "SenhaFraca",
    "TokenInvalido",
    "central_ativa",
    "definir_por_token",
    "identidade_de",
    "pedir_link",
    "ip_do_request",
    "trocar",
    "usa_central",
]
