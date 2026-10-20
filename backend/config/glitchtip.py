"""
Erros do backend no GlitchTip da SEJA AP (TSK-1147), sem dado pessoal.

O GlitchTip (https://erros.sejaap.com.br, projeto `crm`) fala o protocolo do
Sentry, então o cliente é o `sentry-sdk`. Quem liga é o fim de
`config/settings.py`, só com `SENTRY_DSN` no ambiente e nunca na suíte: sem DSN
o SDK nem é iniciado e nada sai da máquina. É o mesmo padrão do Conecta
(TSK-1136), adaptado ao que o CRM guarda: contato de lead.

LGPD: o evento não pode carregar dado de lead nem de quem usa. Por isso a
configuração abaixo é fechada por padrão e o `limpar_evento` passa por cima de
tudo:

- `send_default_pii=False`: sem usuário, IP e cookies coletados pelo SDK (o IP
  da conexão quem tira é o `scrub_config` do projeto, no servidor);
- `include_local_variables=False`: as variáveis de cada frame (o `cliente`, o
  `request.data`) não saem; fica só o código e a linha;
- `max_request_body_size='never'`: o corpo da requisição não é lido;
- log não vira evento nem rastro (`LoggingIntegration(level=None,
  event_level=None)`): mensagem de log leva nome de lead, e regex não acha
  nome. O que vira evento é a exceção NÃO tratada (500 do Django e do DRF,
  comando de manage.py que morre);
- sem tracing, sem profiling e sem sessões de release health (a .164 tem pouca
  folga), e sem integrações automáticas nem cabeçalho de rastreio nas chamadas
  de saída (o Conecta ID não precisa de `sentry-trace`/`baggage`).

`limpar_evento` é o `before_send`: tira cookies, corpo, query string, ambiente
WSGI e usuário da requisição, deixa só cabeçalhos de uma lista fechada, apaga
variáveis de frame, corta o `sys.argv` no nome do comando e mascara, em
qualquer texto do evento, CNPJ, CPF, e-mail, telefone (com e sem DDI e DDD, com
e sem máscara, o do WhatsApp também), JWT, `Bearer`, chave de API do CRM, a
AppKey do Conecta ID, o nome de lead no repr de um `Cliente` e o `DETAIL` dos
erros do Postgres (a linha do lead), além do valor de toda chave com nome
sensível (senha, token, authorization, cookie, cpf, cnpj, e-mail, telefone,
nome, contato...), inclusive dentro de JSON, repr ou formulário em texto.

As regras espelham `frontend/src/services/glitchtip.js`: mudou uma, mude a outra.
"""

import re
import sys

FILTRADO = "[Filtrado]"

# Chave cujo VALOR nunca sai, em qualquer nível do evento. Além das credenciais e
# dos documentos, os campos de lead do CRM (`nome`, `indicador_whatsapp`,
# `quem_fara_contato`, `responsavel`, `consultor_atual`, `notas`, `motivo_distrato`,
# `municipio`...). `name` fica de fora
# de propósito: é chave do próprio SDK (`server_name`, `sdk.name`, `runtime.name`).
CHAVE_SENSIVEL = re.compile(
    r"senha|password|passwd|pwd|secret|segredo|token|authori[sz]ation|auth|cookie|"
    r"session|sessao|sessão|csrf|chave|api[_-]?key|app[_-]?key|jwt|dsn|signature|assinatura|"
    r"cpf|cnpj|e-?mail|telefone|celular|phone|fone|whats|first_name|last_name|full_name|username|"
    r"nome|razao|razão|contato|responsavel|responsável|indicador|consultor|empresa|"
    r"endereco|endereço|munic|notas|observa|motivo",
    re.IGNORECASE,
)

# Cabeçalhos que ajudam a entender o erro e não identificam ninguém. Lista
# fechada: o resto (Authorization, Cookie, X-API-Key, X-Forwarded-For,
# X-Real-IP, CF-Connecting-IP...) não sai, nem mascarado.
CABECALHOS_PERMITIDOS = {
    "accept",
    "accept-encoding",
    "accept-language",
    "content-length",
    "content-type",
    "host",
    "origin",
    "referer",
    "user-agent",
    "x-requested-with",
}

_NOMES_SENSIVEIS = CHAVE_SENSIVEL.pattern

# Só para texto que não é código: nas linhas de código dos frames, `senha = ...`
# e `.filter(telefone=telefone)` são nomes de variável, e a máscara os estragaria.
# Partes das máscaras de chave. Valor entre aspas, com escape e com o `b` de bytes
# (b'...'); o fim do texto vale como aspa de fechamento.
_CHAVE_ENTRE_ASPAS = (r'(?:"[^"\n]{0,64}?(?:' + _NOMES_SENSIVEIS + r')[^"\n]{0,64}?"'
                      r"|'[^'\n]{0,64}?(?:" + _NOMES_SENSIVEIS + r")[^'\n]{0,64}?')")
_VALOR_ASPAS_DUPLAS = r'b?"(?:[^"\\]|\\.)*(?:"|\\?\Z)'
_VALOR_ASPAS_SIMPLES = r"b?'(?:[^'\\]|\\.)*(?:'|\\?\Z)"
# Lista ou objeto como valor ({'nome': ['Padaria'], "responsavel": {...}}): sai o
# resto da linha inteiro. Achar o fecho exigiria contar aspas e aninhamento
# ("Padaria [Centro]", listas dentro de listas), e regex não conta; perder o que
# vem depois na mesma linha é o preço de nada do valor escapar.
_VALOR_LISTA_OU_OBJETO = r"[\[{][^\n]*"
# Valor sem aspas: vai até o fim da linha ou até a próxima `chave=`/`chave:`
# (depois de espaço, vírgula, ponto e vírgula ou &). Aspas, apóstrofo, parêntese,
# vírgula e & no meio são do valor: razão social tem "D'Ouro", "& Filhos",
# "(Centro)", e `notas` é texto livre. Cada caractere olha no máximo ~45 adiante.
_VALOR_SEM_ASPAS = r"(?:(?![,;&\s][ \t]{0,3}[\w-]{1,40}[ \t]{0,3}[:=])[^\n])+"

# Só para texto que não é código: nas linhas de código dos frames, `senha = ...`
# e `.filter(telefone=telefone)` são nomes de variável, e a máscara os estragaria.
_MASCARAS_DE_CHAVE = (
    # Chave sensível dentro de um TEXTO: JSON ou repr de dict, com qualquer par de
    # aspas na chave e no valor (o repr do Python troca para aspas duplas quando o
    # valor tem apóstrofo: {'nome': "Padaria D'Ouro"}).
    # Os trechos de nome têm teto ({0,64}, {0,40}) para a regex não ficar quadrática.
    # O fim do texto vale como aspa de fechamento: num texto cortado, o valor que
    # ficou aberto ("senha": "Minha senha#20...) sai inteiro como [Filtrado], mesmo
    # que o corte tenha caído logo depois da barra de um escape (ç, \n).
    (re.compile(r"(" + _CHAVE_ENTRE_ASPAS + r"\s*:\s*)" + _VALOR_ASPAS_DUPLAS, re.IGNORECASE),
     r'\1"[Filtrado]"'),
    (re.compile(r"(" + _CHAVE_ENTRE_ASPAS + r"\s*:\s*)" + _VALOR_ASPAS_SIMPLES, re.IGNORECASE),
     r"\1'[Filtrado]'"),
    (re.compile(r"(" + _CHAVE_ENTRE_ASPAS + r"\s*:\s*)" + _VALOR_LISTA_OU_OBJETO, re.IGNORECASE),
     r"\1[Filtrado]"),
    # Formulário, query, argumento nomeado e texto de log: senha=..., nome='...',
    # `senha: ...`, `password = ...`, `Authorization: Basic ...`.
    (re.compile(r"(\b\w{0,40}?(?:" + _NOMES_SENSIVEIS + r")\w{0,40}?[ \t]{0,3}[:=][ \t]{0,3})"
                r"(?:b?'(?:[^'\\\n]|\\.)*(?:'|\Z)|b?\"(?:[^\"\\\n]|\\.)*(?:\"|\Z)|"
                + _VALOR_LISTA_OU_OBJETO + r"|" + _VALOR_SEM_ASPAS + r")",
                re.IGNORECASE), r"\1[Filtrado]"),
)

# Separador de telefone: espaço, ponto ou hífen, no máximo um entre os blocos.
_SEP = r"[ .\-]?"

_MASCARAS_DE_DADO = (
    # Erro do Postgres traz a linha recusada inteira (nome, telefone, e-mail do
    # lead), e regex não acha nome: do `DETAIL:` em diante nada sai (nem a coluna
    # do `Key (...)`, nem o HINT; a constraint fica na primeira linha). Fora do
    # DETAIL, o valor do `Key (coluna)=(valor)` some e a coluna fica.
    (re.compile(r"DETAIL:.*", re.DOTALL), "DETAIL: [Filtrado]"),
    (re.compile(r"Failing row contains \(.*", re.DOTALL), "Failing row contains ([Filtrado])"),
    (re.compile(r"(\bKey \([^)]{0,200}\))=\((?:[^()]|\([^()]*(?:\)|\Z))*(?:\)|\Z)"), r"\1=([Filtrado])"),
    # O repr de um Cliente é o nome do lead (`Cliente.__str__`); o de um User é o
    # username. O teto de 200 é o do campo `nome`.
    (re.compile(r"<(Cliente|User|VinculoIdentidade|ApiKey): [^<>\n]{0,200}(?:>|\Z)"), r"<\1: [Filtrado]>"),
    (re.compile(r"(?i)\bbearer\s+[^\s,;\"']+"), "Bearer [token]"),
    (re.compile(r"(?i)\bapi-key\s+[^\s,;\"']+"), "Api-Key [token]"),
    (re.compile(r"(?i)\bappkey\s+[^\s,;\"']+"), "AppKey [token]"),
    # Chave de API do CRM em qualquer texto: `crm_<prefixo>_<segredo>`.
    (re.compile(r"\bcrm_[a-z0-9]{8}_[\w-]+"), "[api-key]"),
    # Sem exigir os dois pontos: um JWT cortado ao meio continua reconhecível.
    (re.compile(r"\beyJ[\w-]+(?:\.[\w-]*)*"), "[token]"),
    # Partes com teto (64 e 253, os do RFC): sem ele a regex reescaneia cada trecho
    # longo sem `@` e fica quadrática (50 KB custavam segundos).
    (re.compile(r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}"), "[e-mail]"),
    # CNPJ numérico com a máscara inteira, parcial ou nenhuma (12345678/0001-95,
    # 12.345.678/000195, 12.345.678.0001-95...): o campo `cnpj` guarda o que foi
    # digitado ou importado, sem normalizar.
    (re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}[/.]?\d{4}-?\d{2}\b"), "[CNPJ]"),
    # CNPJ alfanumérico (o novo, de 2026: 12 posições de letra ou número e 2 dígitos
    # verificadores), em maiúsculas ou minúsculas. Sem máscara, exige um dígito nas
    # 12 primeiras posições, para não pegar um identificador como `handleSubmit01`.
    # Com máscara inteira ou parcial: pelo menos um separador (., / ou -).
    (re.compile(r"(?i)\b(?=[A-Z0-9]{2,14}[./-])[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}[/.]?[A-Z0-9]{4}-?\d{2}\b"),
     "[CNPJ]"),
    (re.compile(r"(?i)\b(?=[A-Z0-9]{0,11}\d)[A-Z0-9]{12}\d{2}\b"), "[CNPJ]"),
    # CPF com a máscara inteira, parcial ou nenhuma (123.456.789-09, 123456789-09...).
    (re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b"), "[CPF]"),
    # Telefone com DDD, com ou sem DDI (+55, 0055 ou 55 colado, como no link do
    # WhatsApp), com ou sem parênteses e zero de operadora, com ou sem o nono
    # dígito e com espaço, ponto ou hífen entre os blocos:
    # +55 (11) 9 1234-5678, 5511912345678, (011) 3234-5678, 11 3234.5678...
    (re.compile(r"(?<![\w+])(?:(?:\+|00) ?55" + _SEP + r"|55" + _SEP + r")?"
                r"(?:\(0?[1-9]\d\)|0?[1-9]\d)" + _SEP +
                r"(?:9" + _SEP + r"\d{4}|[2-9]\d{3})" + _SEP + r"\d{4}(?!\w)"), "[telefone]"),
    # Sem DDD: o celular de nove dígitos (91234-5678, 9 1234 5678, 912345678), o
    # fixo de oito, que começa de 2 a 5 (3234-5678, 32345678), e o celular antigo de
    # oito, de 6 a 9, só com separador (8123-4567). Um intervalo de anos (2025-2026)
    # não é telefone.
    (re.compile(r"(?<![\w+.\-])9" + _SEP + r"\d{4}" + _SEP + r"\d{4}(?!\w)"), "[telefone]"),
    (re.compile(r"(?<![\w+.\-])(?!(?:19|20)\d\d" + _SEP + r"(?:19|20)\d\d(?!\w))"
                r"(?:[2-5]\d{3}" + _SEP + r"|[6-9]\d{3}[ .\-])\d{4}(?!\w)"), "[telefone]"),
)

# Profundidade máxima da varredura: o SDK já corta o evento bem antes disso.
_PROFUNDIDADE = 20

# Teto de cada texto: o before_send roda no worker que está devolvendo o 500. As
# máscaras rodam sobre um pouco mais que isso (a folga), e só depois vem o corte final.
_TAMANHO_MAXIMO = 16384
_FOLGA_DAS_MASCARAS = 1024

# `max_value_length` do SDK: ele corta cada texto em até tantos bytes, com '...' no
# fim, ANTES do before_send.
MAX_VALUE_LENGTH = 8192
_MARCA_DO_SDK = "..."

# Linhas do NOSSO código em volta do erro: passam pelas máscaras de dado (há e-mail
# literal no código), mas não pelas de chave em texto.
_CONTEXTO_DE_CODIGO = {"pre_context", "context_line", "post_context"}

# Caracteres de que CPF, CNPJ, e-mail, telefone, JWT e URL são feitos.
_PONTUACAO_DE_DADO = frozenset("._%+-@/=:()")

# Campos do próprio SDK, que não carregam dado de ninguém e não passam pelas
# máscaras: um debug ID como `01191234-5678-...` viraria "[telefone]-..." e o
# frame perderia o source map.
_CAMPOS_DO_SDK = ("event_id", "release", "dist", "environment", "timestamp",
                  "start_timestamp", "debug_meta", "sdk")

# Do `sys.argv` que a ArgvIntegration põe no evento, só o programa e o comando
# (`manage.py criar_api_key`): o resto pode ser e-mail, nome ou senha.
_ARGV_PERMITIDO = 2


def _sem_resto_cortado(texto):
    """
    Tira do fim a sequência de caracteres de dado que o corte pode ter partido: um
    "123.456.7", um "+55 (11) 9123" ou um "fulana@empre" já não casam com a máscara
    e sairiam crus. O espaço só conta entre blocos de telefone (depois de dígito ou
    de parêntese).
    """
    fim = len(texto)
    while fim and (texto[fim - 1].isalnum() or texto[fim - 1] in _PONTUACAO_DE_DADO
                   or (texto[fim - 1] == " " and fim > 1
                       and (texto[fim - 2].isdigit() or texto[fim - 2] == ")"))):
        fim -= 1
    return texto[:fim].rstrip()


def _cortado_pelo_sdk(texto):
    return (texto.endswith(_MARCA_DO_SDK) and len(texto) * 4 >= MAX_VALUE_LENGTH - 8
            and len(texto.encode("utf-8", "ignore")) >= MAX_VALUE_LENGTH - 8)


def mascarar_texto(texto, codigo=False):
    """
    Troca CNPJ, CPF, e-mail, telefone e token dentro de um texto qualquer.

    O corte vem DEPOIS das máscaras, e o que um corte partir ao meio sai inteiro:
    pedaço de dado no fim de um texto cortado não casa com regex nenhuma.
    `codigo=True` (linha de código de um frame) pula as máscaras de chave em texto.
    """
    cortado = False
    if _cortado_pelo_sdk(texto):
        texto, cortado = _sem_resto_cortado(texto[:-len(_MARCA_DO_SDK)]), True
    limite = _TAMANHO_MAXIMO + _FOLGA_DAS_MASCARAS
    if len(texto) > limite:
        texto, cortado = _sem_resto_cortado(texto[:limite]), True
    grupos = (_MASCARAS_DE_DADO,) if codigo else (_MASCARAS_DE_CHAVE, _MASCARAS_DE_DADO)
    for grupo in grupos:
        for padrao, troca in grupo:
            texto = padrao.sub(troca, texto)
    if len(texto) > _TAMANHO_MAXIMO:
        texto, cortado = _sem_resto_cortado(texto[:_TAMANHO_MAXIMO]), True
    return texto + " [cortado]" if cortado else texto


def _sem_query(url):
    """URL sem query string nem fragmento: busca de tela leva nome e telefone."""
    if not isinstance(url, str):
        return url
    return url.split("?", 1)[0].split("#", 1)[0]


def _varrer(valor, profundidade=0, codigo=False):
    if profundidade > _PROFUNDIDADE:
        return FILTRADO
    if isinstance(valor, str):
        return mascarar_texto(valor, codigo=codigo)
    if isinstance(valor, dict):
        limpo = {}
        for chave, item in valor.items():
            if isinstance(chave, str) and CHAVE_SENSIVEL.search(chave):
                limpo[chave] = FILTRADO
            else:
                limpo[chave] = _varrer(item, profundidade + 1,
                                       codigo=codigo or chave in _CONTEXTO_DE_CODIGO)
        return limpo
    if isinstance(valor, (list, tuple)):
        return [_varrer(item, profundidade + 1, codigo=codigo) for item in valor]
    return valor


def _limpar_requisicao(requisicao):
    if not isinstance(requisicao, dict):
        return None
    cabecalhos = requisicao.get("headers") or {}
    if not isinstance(cabecalhos, dict):
        cabecalhos = {}
    limpa = {
        "method": requisicao.get("method"),
        "url": _sem_query(requisicao.get("url")),
        "headers": {
            nome: _sem_query(valor) if nome.lower() in ("referer", "origin") else valor
            for nome, valor in cabecalhos.items()
            if isinstance(nome, str) and nome.lower() in CABECALHOS_PERMITIDOS
        },
    }
    return {chave: valor for chave, valor in limpa.items() if valor}


def _sem_variaveis_de_frame(evento):
    blocos = [evento]
    blocos.extend((evento.get("exception") or {}).get("values") or [])
    blocos.extend((evento.get("threads") or {}).get("values") or [])
    for bloco in blocos:
        if not isinstance(bloco, dict):
            continue
        for frame in ((bloco.get("stacktrace") or {}).get("frames") or []):
            if isinstance(frame, dict):
                frame.pop("vars", None)


def _limpar_rastros(evento):
    rastros = evento.get("breadcrumbs")
    lista = rastros.get("values") if isinstance(rastros, dict) else rastros
    for rastro in lista or []:
        dados = rastro.get("data") if isinstance(rastro, dict) else None
        if isinstance(dados, dict):
            for campo in ("url", "to", "from"):
                if campo in dados:
                    dados[campo] = _sem_query(dados[campo])
            dados.pop("http.query", None)
            dados.pop("http.fragment", None)


def _argv_curto(evento):
    extra = evento.get("extra")
    if isinstance(extra, dict) and isinstance(extra.get("sys.argv"), (list, tuple)):
        extra["sys.argv"] = list(extra["sys.argv"][:_ARGV_PERMITIDO])


def limpar_evento(evento, hint=None):
    """`before_send` do SDK: o evento sai sem dado pessoal (ver o docstring do módulo)."""
    if not isinstance(evento, dict):
        return evento
    evento.pop("user", None)
    # As anotações do SDK sobre a requisição falam de campos que já não existem aqui.
    if isinstance(evento.get("_meta"), dict):
        evento["_meta"].pop("request", None)
        evento["_meta"].pop("user", None)
        if isinstance(evento["_meta"].get("extra"), dict):
            evento["_meta"]["extra"].pop("sys.argv", None)
    if "request" in evento:
        requisicao = _limpar_requisicao(evento["request"])
        if requisicao:
            evento["request"] = requisicao
        else:
            evento.pop("request")
    _sem_variaveis_de_frame(evento)
    _limpar_rastros(evento)
    _argv_curto(evento)
    guardados = {campo: evento.pop(campo) for campo in _CAMPOS_DO_SDK if campo in evento}
    contextos = evento.get("contexts")
    rastreio = contextos.pop("trace", None) if isinstance(contextos, dict) else None
    limpo = _varrer(evento)
    limpo.update(guardados)
    if rastreio is not None:
        limpo.setdefault("contexts", {})["trace"] = rastreio
    return limpo


def iniciar(dsn, release=None, environment="production", transport=None):
    """
    Liga o SDK. Sem DSN não faz nada e devolve False.

    `transport` existe para o teste capturar o evento sem rede; em produção fica
    o padrão do SDK, que manda para o GlitchTip do DSN.
    """
    dsn = (dsn or "").strip()
    if not dsn:
        return False

    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration

    opcoes = {}
    if transport is not None:
        opcoes["transport"] = transport

    try:
        sentry_sdk.init(
            dsn=dsn,
            release=(release or "").strip() or None,
            environment=(environment or "").strip() or "production",
            send_default_pii=False,
            include_local_variables=False,
            max_request_body_size="never",
            # Trunca cada texto do evento antes do before_send.
            max_value_length=MAX_VALUE_LENGTH,
            before_send=limpar_evento,
            # Sem tracing (`traces_sample_rate` ausente = desligado) e sem profiling.
            auto_session_tracking=False,
            send_client_reports=False,
            # Sem isto o SDK põe `sentry-trace` e `baggage` em TODA chamada de saída
            # (o Conecta ID, por exemplo), mesmo com o tracing desligado.
            trace_propagation_targets=[],
            # Só as integrações listadas abaixo e as básicas do SDK. As automáticas
            # ligam sozinhas quando o pacote está instalado; no Conecta a do Redis
            # gravava no rastro a chave da sessão do /admin.
            auto_enabling_integrations=False,
            integrations=[
                DjangoIntegration(transaction_style="url"),
                LoggingIntegration(level=None, event_level=None),
            ],
            **opcoes,
        )
    except Exception as erro:  # noqa: BLE001
        # DSN malformado (sem a chave, sem esquema) não pode derrubar o Django: o
        # import de settings morreria e o container não subiria. Sem GlitchTip, o
        # resto segue. No stderr: o stdout de um `dumpdata` é o próprio arquivo.
        print(f"[GLITCHTIP] desligado: SENTRY_DSN inválido ({type(erro).__name__})", file=sys.stderr)
        return False
    print(f'[GLITCHTIP] ligado (release={release or "-"})', file=sys.stderr)
    return True
