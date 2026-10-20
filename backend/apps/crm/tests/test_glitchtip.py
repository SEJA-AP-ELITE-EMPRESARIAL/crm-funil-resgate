"""
Erros do backend no GlitchTip sem dado pessoal (TSK-1147).

Garantias do contrato, cada uma com o seu teste:

1. O `before_send` (`config.glitchtip.limpar_evento`) mascara CNPJ, CPF, e-mail,
   telefone de lead (todos os formatos), nome de lead em chave=valor, senha, token,
   o cabeçalho Authorization, cookies e o corpo da requisição.
2. Na suíte o SDK fica desligado: nada sai da máquina, com ou sem SENTRY_DSN.
3. A rota de diagnóstico só dispara para superusuário com JWT, com cota.
4. Ligado, o evento de uma exceção real sai com o release pedido e já limpo. Este
   teste troca o transporte do SDK por um que só guarda o envelope: sem rede.
"""
import json
import time
from unittest import mock

import sentry_sdk
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.handlers.wsgi import WSGIHandler
from django.core.signals import request_finished, request_started
from django.db import close_old_connections
from django.test import SimpleTestCase, TestCase
from django.test.client import RequestFactory
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from sentry_sdk.transport import Transport

from apps.crm.models import ApiKey
from apps.crm.views.diagnostico_views import ErroDeTesteDoGlitchTip
from config import glitchtip
from config.glitchtip import FILTRADO, limpar_evento, mascarar_texto

User = get_user_model()

CNPJ = "12.345.678/0001-95"
CNPJ_LIMPO = "12345678000195"
CPF = "123.456.789-09"
EMAIL = "fulana.lead@empresa.com.br"
TELEFONE = "(11) 91234-5678"
SENHA = "Senha-Secreta-123"
JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjo0Mn0.c2lnbmF0dXJh"
CHAVE_API = "crm_ab12cd34_" + "s" * 32
NOME_LEAD = "Padaria Pao Quente"
ROTA = "/api/crm/diagnostico/erro-de-teste/"

# Telefone de lead nos formatos que chegam ao CRM (planilha importada, WhatsApp,
# digitado à mão), cada um com o pedaço que não pode sobrar.
TELEFONES = (
    ("+55 (11) 91234-5678", "91234"),
    ("+55 11 91234-5678", "91234"),
    ("+55 11 9 1234-5678", "1234-5678"),
    ("+5511912345678", "912345678"),
    ("5511912345678", "912345678"),
    ("0055 11 912345678", "912345678"),
    ("551132345678", "32345678"),
    ("+55 (11) 3234-5678", "3234"),
    ("(11) 91234-5678", "91234"),
    ("(11)91234-5678", "91234"),
    ("(11) 912345678", "912345678"),
    ("(011) 91234-5678", "91234"),
    ("(11) 3234-5678", "3234"),
    ("11 91234-5678", "91234"),
    ("11 9 1234 5678", "1234 5678"),
    ("11.91234.5678", "91234"),
    ("11-91234-5678", "91234"),
    ("11912345678", "912345678"),
    ("1132345678", "32345678"),
    ("11 3234-5678", "3234"),
    ("11 32345678", "32345678"),
    ("91234-5678", "91234"),
    ("9 1234-5678", "1234-5678"),
    ("912345678", "912345678"),
    ("3234-5678", "3234"),
    ("3234 5678", "3234"),
    ("32345678", "32345678"),
    ("8123-4567", "8123"),
    ("https://wa.me/5511912345678", "912345678"),
    ("https://api.whatsapp.com/send?phone=5511912345678", "912345678"),
)


def _evento_com_dado_pessoal():
    """Um evento no formato do SDK do Django, com dado pessoal em todo canto."""
    return {
        "message": f"Falha no lead {CNPJ} ({EMAIL}, {TELEFONE})",
        "exception": {"values": [{
            "type": "IntegrityError",
            "value": f"Key (cnpj)=({CNPJ_LIMPO}) already exists; cpf {CPF}",
            "stacktrace": {"frames": [{
                "filename": "apps/crm/views/cliente_views.py",
                "function": "cliente_root",
                "vars": {"cliente": f"<Cliente: {NOME_LEAD}>", "senha": SENHA},
            }]},
        }]},
        "request": {
            "method": "POST",
            "url": f"https://conecta-crm.sejaap.com.br/api/crm/clientes/?search={EMAIL}&tel=11912345678",
            "query_string": f"search={EMAIL}&tel=11912345678",
            "headers": {
                "Authorization": f"Bearer {JWT}",
                "X-Api-Key": CHAVE_API,
                "Cookie": "sessionid=abc123; csrftoken=def456",
                "X-Forwarded-For": "200.200.200.200",
                "X-Real-Ip": "200.200.200.200",
                "Cf-Connecting-Ip": "200.200.200.200",
                "User-Agent": "Mozilla/5.0",
                "Referer": f"https://conecta-crm.sejaap.com.br/?busca={EMAIL}",
            },
            "cookies": {"sessionid": "abc123"},
            "data": {"email": EMAIL, "telefone": TELEFONE, "nome": NOME_LEAD, "cnpj": CNPJ},
            "env": {"REMOTE_ADDR": "200.200.200.200"},
        },
        "user": {"id": 42, "email": EMAIL, "ip_address": "200.200.200.200"},
        "extra": {
            "password": SENHA,
            "detalhe": f"whatsapp +55 11 98765-4321, token {JWT}",
            "sys.argv": ["manage.py", "criar_api_key", NOME_LEAD, "--usuario", EMAIL],
        },
        "breadcrumbs": {"values": [{
            "category": "httplib",
            "data": {"url": f"http://identidade-api:8000/api/v1/usuarios/?email={EMAIL}",
                     "http.query": f"email={EMAIL}"},
        }]},
    }


class LimparEventoTests(SimpleTestCase):
    """Passo 1 do contrato: CNPJ, telefone, e-mail e Authorization saem mascarados."""

    def setUp(self):
        self.limpo = limpar_evento(_evento_com_dado_pessoal())
        self.texto = json.dumps(self.limpo, ensure_ascii=False)

    def test_nenhum_dado_pessoal_sobra_em_lugar_nenhum_do_evento(self):
        for dado in (CNPJ, CNPJ_LIMPO, CPF, EMAIL, TELEFONE, "91234-5678", "98765-4321",
                     "11912345678", SENHA, JWT, CHAVE_API, NOME_LEAD, "abc123", "def456",
                     "200.200.200.200"):
            with self.subTest(dado=dado):
                self.assertNotIn(dado, self.texto)

    def test_cnpj_cpf_email_e_telefone_viram_marcadores_legiveis(self):
        valor = self.limpo["exception"]["values"][0]["value"]
        self.assertEqual(valor, "Key (cnpj)=([Filtrado]) already exists; cpf [CPF]")
        self.assertEqual(self.limpo["message"], "Falha no lead [CNPJ] ([e-mail], [telefone])")

    def test_authorization_cookie_e_ip_nao_saem_e_o_resto_e_lista_fechada(self):
        cabecalhos = self.limpo["request"]["headers"]
        self.assertEqual(set(cabecalhos), {"User-Agent", "Referer"})
        self.assertEqual(cabecalhos["Referer"], "https://conecta-crm.sejaap.com.br/")

    def test_corpo_cookies_query_e_ambiente_da_requisicao_somem(self):
        requisicao = self.limpo["request"]
        for campo in ("data", "cookies", "query_string", "env"):
            with self.subTest(campo=campo):
                self.assertNotIn(campo, requisicao)
        self.assertEqual(requisicao["url"], "https://conecta-crm.sejaap.com.br/api/crm/clientes/")

    def test_usuario_e_variaveis_de_frame_nao_saem(self):
        self.assertNotIn("user", self.limpo)
        frame = self.limpo["exception"]["values"][0]["stacktrace"]["frames"][0]
        self.assertNotIn("vars", frame)
        self.assertEqual(frame["function"], "cliente_root")
        self.assertEqual(frame["filename"], "apps/crm/views/cliente_views.py")

    def test_chave_sensivel_tem_o_valor_trocado(self):
        self.assertEqual(self.limpo["extra"]["password"], FILTRADO)
        self.assertEqual(self.limpo["extra"]["detalhe"], "whatsapp [telefone], token [token]")

    def test_argv_fica_so_com_o_comando(self):
        self.assertEqual(self.limpo["extra"]["sys.argv"], ["manage.py", "criar_api_key"])

    def test_rastro_de_http_sai_sem_query(self):
        dados = self.limpo["breadcrumbs"]["values"][0]["data"]
        self.assertEqual(dados["url"], "http://identidade-api:8000/api/v1/usuarios/")
        self.assertNotIn("http.query", dados)

    def test_telefone_de_lead_em_todos_os_formatos(self):
        for telefone, pedaco in TELEFONES:
            with self.subTest(telefone=telefone):
                limpo = mascarar_texto(f"ligar para {telefone} hoje")
                self.assertNotIn(pedaco, limpo)
                self.assertIn("[", limpo)
                self.assertTrue(limpo.startswith("ligar para "), limpo)
                # Em `phone=...` a máscara de chave leva o valor e as palavras soltas depois.
                if "=" not in telefone:
                    self.assertTrue(limpo.endswith(" hoje"), limpo)

    def test_telefone_mascarado_tambem_na_linha_de_codigo(self):
        evento = limpar_evento({"exception": {"values": [{"stacktrace": {"frames": [{
            "context_line": '    TELEFONE_TESTE = "+55 (11) 91234-5678"',
            "post_context": ['    filtro = Cliente.objects.filter(telefone=telefone, nome=nome)'],
        }]}}]}})
        frame = evento["exception"]["values"][0]["stacktrace"]["frames"][0]
        self.assertEqual(frame["context_line"], '    TELEFONE_TESTE = "[telefone]"')
        # Nome de variável não é dado: as máscaras de chave não valem no código.
        self.assertEqual(frame["post_context"],
                         ['    filtro = Cliente.objects.filter(telefone=telefone, nome=nome)'])

    def test_texto_comum_com_numeros_nao_vira_telefone(self):
        for comum in ("Periodo 01 2025-2026", "anos 2025 2026", "versão 2.72.0",
                      "linha 1234 de 5678", "id=42 status=500", "R$ 12.345,67",
                      "2026-10-20T19:38:00", "IP 187.77.48.164", "porta 11470"):
            with self.subTest(texto=comum):
                self.assertEqual(mascarar_texto(comum), comum)

    def test_nome_de_lead_em_chave_valor_json_e_repr(self):
        casos = {
            f"nome={NOME_LEAD.replace(' ', '+')}&etapa=priorizado": "nome=[Filtrado]&etapa=priorizado",
            f'{{"nome": "{NOME_LEAD}", "etapa": "ok"}}': '{"nome": "[Filtrado]", "etapa": "ok"}',
            f"{{'indicador_nome': '{NOME_LEAD}', 'etapa': 'ok'}}":
                "{'indicador_nome': '[Filtrado]', 'etapa': 'ok'}",
            f"Cliente(nome='{NOME_LEAD}', responsavel=\"Joana\")":
                "Cliente(nome=[Filtrado], responsavel=[Filtrado])",
            f"quem_fara_contato=Joana indicador_whatsapp=11912345678":
                "quem_fara_contato=[Filtrado] indicador_whatsapp=[Filtrado]",
            f"Erro ao salvar <Cliente: {NOME_LEAD}>": "Erro ao salvar <Cliente: [Filtrado]>",
        }
        for texto, esperado in casos.items():
            with self.subTest(texto=texto[:30]):
                self.assertEqual(mascarar_texto(texto), esperado)

    def test_chave_valor_com_aspas_misturadas_escape_bytes_e_espacos(self):
        casos = {
            # O repr do Python troca para aspas duplas quando o valor tem apóstrofo.
            repr({"nome": "Padaria D'Ouro", "etapa": "ok"}): "{'nome': \"[Filtrado]\", 'etapa': 'ok'}",
            "Cliente(nome='Maria D\\'Avila', x=1)": "Cliente(nome=[Filtrado], x=1)",
            "{'senha': b'abc'}": "{'senha': '[Filtrado]'}",
            "nome=Padaria Pao Quente etapa=priorizado": "nome=[Filtrado] etapa=priorizado",
            "endereço=Rua das Flores 123": "endereço=[Filtrado]",
            "senha: Minha123": "senha: [Filtrado]",
            "token: abc.def": "token: [Filtrado]",
            "password = hunter2": "password = [Filtrado]",
            "notas=ligar depois do almoço": "notas=[Filtrado]",
            # Pontuação de razão social e de texto livre é do valor.
            "nome=Padaria D'Ouro Ltda etapa=x": "nome=[Filtrado] etapa=x",
            "nome: Padaria São João & Filhos": "nome: [Filtrado]",
            "nome_fantasia: Padaria (Centro) Ltda": "nome_fantasia: [Filtrado]",
            "notas=Cliente bravo, ligar amanhã": "notas=[Filtrado]",
            "observação: Cliente pediu desconto": "observação: [Filtrado]",
            "https://x/?nome=Padaria&id=3": "https://x/?nome=[Filtrado]&id=3",
            # Lista ou objeto como valor (o repr da QueryDict de um multipart).
            # O resto do texto vai junto: o fecho da lista não é confiável.
            "<QueryDict: {'nome': ['Padaria do João'], 'etapa': ['x']}>": "<QueryDict: {'nome': [Filtrado]",
            '{"nome": ["Padaria [Centro] São João"], "etapa": "x"}': '{"nome": [Filtrado]',
            '{"nomes": [["Ana", "Bia"], ["Cia"]]}': '{"nomes": [Filtrado]',
            '{"responsavel": {"first_name": "Maria", "last_name": "Souza"}}': '{"responsavel": [Filtrado]',
            "erro {'nome': ['Padaria']}\nlinha seguinte": "erro {'nome': [Filtrado]",
            '{\n  "nome": [\n    "Padaria do João"\n  ],\n  "etapa": "x"\n}': '{\n  "nome": [Filtrado]',
            'nome=[\n"Padaria do João"\n]': "nome=[Filtrado]",
            "username=maria.souza first_name=Maria": "username=[Filtrado] first_name=[Filtrado]",
        }
        for texto, esperado in casos.items():
            with self.subTest(texto=texto[:30]):
                self.assertEqual(mascarar_texto(texto), esperado)
        for comum in ("erro: algo deu errado", "status=500 detail=x"):
            self.assertEqual(mascarar_texto(comum), comum)

    def test_cnpj_e_cpf_com_mascara_parcial_ou_minusculas(self):
        for cnpj in ("12345678/0001-95", "12.345.678/000195", "12.345.678.0001-95", "12345678000195",
                     "12abc34501de35", "12.abc.345/01de-35", "12ABC345/01DE-35", "12.ABC.345/01DE35",
                     "12ABC34501DE-35", "12.ABC.34501DE35"):
            with self.subTest(cnpj=cnpj):
                self.assertEqual(mascarar_texto(f"cnpj {cnpj} ok"), "cnpj [CNPJ] ok")
        for cpf in ("123456789-09", "123.456.78909", "12345678909"):
            with self.subTest(cpf=cpf):
                self.assertEqual(mascarar_texto(f"cpf {cpf} ok"), "cpf [CPF] ok")
        self.assertEqual(mascarar_texto("handleSubmit01"), "handleSubmit01")

    def test_campos_do_sdk_nao_passam_pelas_mascaras(self):
        """Um debug ID que parece telefone não pode perder o source map do frame."""
        debug_id = "01191234-5678-4abc-8def-0123456789ab"
        evento = limpar_evento({
            "event_id": "01191234567812345678901234567890",
            "release": "1132345678",
            "debug_meta": {"images": [{"debug_id": debug_id}]},
            "contexts": {"trace": {"trace_id": "01191234-5678"}, "outro": {"telefone": "x"}},
        })
        self.assertEqual(evento["debug_meta"]["images"][0]["debug_id"], debug_id)
        self.assertEqual(evento["event_id"], "01191234567812345678901234567890")
        self.assertEqual(evento["release"], "1132345678")
        self.assertEqual(evento["contexts"]["trace"], {"trace_id": "01191234-5678"})
        self.assertEqual(evento["contexts"]["outro"], {"telefone": FILTRADO})

    def test_dicionario_com_campo_de_lead_tem_o_valor_trocado(self):
        evento = limpar_evento({"extra": {"cliente": {
            "nome": NOME_LEAD, "indicador_whatsapp": "11 91234-5678", "etapa": "priorizado"}}})
        self.assertEqual(evento["extra"]["cliente"],
                         {"nome": FILTRADO, "indicador_whatsapp": FILTRADO, "etapa": "priorizado"})

    def test_chave_de_api_appkey_e_bearer_em_texto(self):
        self.assertEqual(mascarar_texto(f"cabeçalho Api-Key {CHAVE_API}"),
                         "cabeçalho Api-Key [token]")
        for credencial in (f"Api-Key {CHAVE_API}", "Basic dXNlcjpwYXNz", "Token abc123", f"Bearer {JWT}"):
            with self.subTest(credencial=credencial[:10]):
                self.assertEqual(mascarar_texto(f"Authorization: {credencial}"), "Authorization: [Filtrado]")
        self.assertEqual(mascarar_texto(f"chave vazada {CHAVE_API} no log"),
                         "chave vazada [api-key] no log")
        self.assertEqual(mascarar_texto("AppKey crm:segredo-do-conecta-id"), "AppKey [token]")
        self.assertEqual(mascarar_texto(f"bearer {JWT}"), "Bearer [token]")
        self.assertEqual(mascarar_texto(f"token cru {JWT[:20]}"), "token cru [token]")

    def test_erro_do_postgres_perde_a_linha_e_o_valor_da_chave(self):
        """Nome, endereço e telefone sem máscara: regex não acha nome, então o DETAIL some."""
        nao_nulo = (
            'null value in column "funil_id" of relation "crm_cliente" violates '
            "not-null constraint\nDETAIL:  Failing row contains (90001, Padaria Pao Quente LTDA, "
            "Joao da Silva, Rua das Flores 123, 11 91234-5678, 1132345678)."
        )
        limpo = mascarar_texto(nao_nulo)
        self.assertTrue(limpo.endswith("DETAIL: [Filtrado]"), limpo)
        for dado in ("Padaria", "Joao", "Flores", "91234", "1132345678"):
            self.assertNotIn(dado, limpo)
        self.assertEqual(
            mascarar_texto('duplicate key value violates unique constraint "x" '
                           "Key (nome)=(Maria Souza) already exists."),
            'duplicate key value violates unique constraint "x" Key (nome)=([Filtrado]) already exists.',
        )
        self.assertEqual(mascarar_texto("Failing row contains (1, Maria)."),
                         "Failing row contains ([Filtrado])")

    def test_dado_na_posicao_do_corte_nao_sai_pela_metade(self):
        """
        CPF, e-mail, telefone e JWT partidos em cada posição possível, nos três cortes:
        o de antes das máscaras, o final e o do `max_value_length` do SDK (com '...').
        """
        def em_volta(dado, posicao, tamanho):
            antes = ("x " * tamanho)[:posicao]
            return antes + dado + " fim" * (tamanho // 4)

        limite_bruto = glitchtip._TAMANHO_MAXIMO + glitchtip._FOLGA_DAS_MASCARAS
        sdk = glitchtip.MAX_VALUE_LENGTH - len("...")
        for dado in ("123.456.789-09", "fulana.lead@empresa.com.br", "+55 (11) 91234-5678",
                     "11 9 1234 5678", JWT):
            for parte in range(1, len(dado)):
                casos = {
                    "antes das máscaras": em_volta(dado, limite_bruto - parte, limite_bruto),
                    "corte final": em_volta(dado, glitchtip._TAMANHO_MAXIMO - parte, limite_bruto),
                    "sdk": em_volta(dado, sdk - parte, sdk)[:sdk] + "...",
                }
                for corte, texto in casos.items():
                    with self.subTest(dado=dado[:6], parte=parte, corte=corte):
                        limpo = mascarar_texto(texto)
                        self.assertTrue(limpo.endswith(" [cortado]"))
                        pedaco = dado[:parte]
                        # Um único caractere de pontuação ("+", "(") não identifica ninguém.
                        if sum(c.isalnum() for c in pedaco) >= 2:
                            self.assertNotIn(pedaco, limpo)

    def test_valor_sensivel_aberto_no_corte_sai_inteiro(self):
        """Senha e nome cujo fechamento ficou depois do corte do SDK (strip_string real)."""
        from sentry_sdk.utils import strip_string

        limite = glitchtip.MAX_VALUE_LENGTH
        for valor in (' {"senha": "Minha senha#2024!"}', " Usuario(senha='Minha senha#2024!')",
                      ' {"nome": "Minha Padaria Querida"}',
                      " Key (nome)=(Joana Silva Pereira) already exists",
                      ' {"senha": "Minha\\u00e7\\u00e3oForte"}', " {'senha': 'Minha\\nSenhaForte'}",
                      " Key (nome)=(Joana (filha) Silva) already exists",
                      " erro em <Cliente: Minha Padaria Querida>"):
            for parte in range(2, len(valor)):
                texto = ("x " * limite)[:limite - 3 - (len(valor) - parte)] + valor + " fim" * 3000
                with self.subTest(valor=valor[:12], parte=parte):
                    limpo = mascarar_texto(strip_string(texto, limite).value)
                    self.assertNotIn("Minha", limpo)
                    self.assertNotIn("Joana", limpo)

    def test_pior_caso_das_regex_dentro_do_limite(self):
        """Entradas montadas para o backtracking, do tamanho que as regex recebem (16 KB + folga)."""
        tamanho = glitchtip._TAMANHO_MAXIMO + glitchtip._FOLGA_DAS_MASCARAS
        casos = {
            "json": ('"token' * tamanho)[:tamanho],
            "formulario": ("token=" * tamanho)[:tamanho],
            "repr": ("{'nome': 'a', " * tamanho)[:tamanho],
            "chave do postgres": ("Key (" * tamanho)[:tamanho],
            "repr de cliente": ("<Cliente: " * tamanho)[:tamanho],
            "alfanumerico": "a" * tamanho,
            "email": ("a." * tamanho)[:tamanho],
            "digitos": "1" * tamanho,
            "telefone": ("+55 (11) 9 " * tamanho)[:tamanho],
            "separadores": ("1 2-3." * tamanho)[:tamanho],
        }
        for nome, texto in casos.items():
            with self.subTest(caso=nome):
                inicio = time.monotonic()
                mascarar_texto(texto)
                self.assertLess(time.monotonic() - inicio, 0.2)

    def test_mascara_cnpj_alfanumerico_e_nao_estraga_texto_comum(self):
        self.assertEqual(mascarar_texto("cnpj 12ABC34501DE35"), "cnpj [CNPJ]")
        self.assertEqual(mascarar_texto("12.ABC.345/01DE-35"), "[CNPJ]")
        comum = 'ValueError: invalid literal for int() with base 10: "abc" (linha 2026)'
        self.assertEqual(mascarar_texto(comum), comum)


class SDKDesligadoNaSuiteTests(SimpleTestCase):
    """Passo 2 do contrato: a suíte roda sem SENTRY_DSN e nada é enviado."""

    def test_settings_nao_ligou_o_sdk(self):
        self.assertFalse(settings.GLITCHTIP_ATIVO)
        self.assertFalse(sentry_sdk.get_client().is_active())

    def test_sem_dsn_iniciar_nao_chama_o_sdk(self):
        with mock.patch("sentry_sdk.init") as init:
            self.assertFalse(glitchtip.iniciar(""))
            self.assertFalse(glitchtip.iniciar(None))
            self.assertFalse(glitchtip.iniciar("   ", release="abc1234"))
        init.assert_not_called()

    def test_dsn_malformado_nao_derruba_o_django(self):
        for dsn in ("https://erros.exemplo.invalid/8", "erros.exemplo.invalid/8"):
            with self.subTest(dsn=dsn), mock.patch("sys.stderr"):
                self.assertFalse(glitchtip.iniciar(dsn))
        self.assertFalse(sentry_sdk.get_client().is_active())

    def test_na_suite_nem_com_dsn_no_ambiente_o_sdk_liga(self):
        import importlib

        from config import settings as modulo

        dsn = "https://chave@erros.exemplo.invalid/8"
        with mock.patch.dict("os.environ", {"SENTRY_DSN": dsn, "GIT_COMMIT": "abc1234"}), \
                mock.patch("config.glitchtip.iniciar") as iniciar:
            recarregado = importlib.reload(modulo)
            self.assertEqual(recarregado.SENTRY_DSN, dsn)
            self.assertEqual(recarregado.SENTRY_RELEASE, "abc1234")
            self.assertFalse(recarregado.GLITCHTIP_ATIVO)
        iniciar.assert_not_called()
        importlib.reload(modulo)

    def test_fora_da_suite_liga_com_o_commit_como_release(self):
        """O mesmo settings, com o argv do gunicorn: liga com DSN, release e ambiente."""
        import importlib

        from config import settings as modulo

        dsn = "https://chave@erros.exemplo.invalid/8"
        with mock.patch.dict("os.environ", {"SENTRY_DSN": dsn, "GIT_COMMIT": "abc1234"}), \
                mock.patch("sys.argv", ["gunicorn", "config.wsgi:application"]), \
                mock.patch("config.glitchtip.iniciar", return_value=True) as iniciar:
            recarregado = importlib.reload(modulo)
            self.assertTrue(recarregado.GLITCHTIP_ATIVO)
        iniciar.assert_called_once_with(dsn, release="abc1234", environment="production")
        importlib.reload(modulo)


class RotaDeErroDeTesteTests(TestCase):
    """A rota do passo 3: só superusuário, só JWT, POST e com cota."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()
        self.super = User.objects.create_superuser("raiz", "raiz@x.com", "x-nao-usar")
        self.staff = User.objects.create_user("staff", "staff@x.com", "x-nao-usar", is_staff=True)
        self.comum = User.objects.create_user("comum", "comum@x.com", "x-nao-usar")

    def _com_jwt(self, usuario):
        token = RefreshToken.for_user(usuario).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    def test_sem_login_e_401(self):
        self.assertEqual(self.client.post(ROTA).status_code, 401)

    def test_quem_nao_e_superusuario_leva_403_sem_a_excecao(self):
        for usuario in (self.comum, self.staff):
            with self.subTest(usuario=usuario.username):
                self._com_jwt(usuario)
                self.assertEqual(self.client.post(ROTA).status_code, 403)

    def test_chave_de_api_nao_serve_nem_a_de_superusuario(self):
        _, chave = ApiKey.gerar("diag", usuario=self.super, escopo="escrita")
        self.client.credentials(HTTP_AUTHORIZATION=f"Api-Key {chave}")
        self.assertEqual(self.client.post(ROTA).status_code, 401)
        self.client.credentials(HTTP_X_API_KEY=chave)
        self.assertEqual(self.client.post(ROTA).status_code, 401)

    def test_get_nao_dispara(self):
        self._com_jwt(self.super)
        self.assertEqual(self.client.get(ROTA).status_code, 405)

    def test_superusuario_dispara_a_excecao(self):
        self._com_jwt(self.super)
        with self.assertRaises(ErroDeTesteDoGlitchTip):
            self.client.post(ROTA)

    def test_cota_de_dez_por_hora_por_usuario(self):
        self._com_jwt(self.super)
        for _ in range(10):
            with self.assertRaises(ErroDeTesteDoGlitchTip):
                self.client.post(ROTA)
        self.assertEqual(self.client.post(ROTA).status_code, 429)
        # A cota é de cada um: outro superusuário segue podendo.
        outro = User.objects.create_superuser("raiz2", "raiz2@x.com", "x-nao-usar")
        self._com_jwt(outro)
        with self.assertRaises(ErroDeTesteDoGlitchTip):
            self.client.post(ROTA)

    def test_quem_leva_403_nao_gasta_a_cota(self):
        self._com_jwt(self.comum)
        for _ in range(12):
            self.assertEqual(self.client.post(ROTA).status_code, 403)


class _TransporteNaMemoria(Transport):
    """Guarda os envelopes em vez de mandá-los: o teste não usa rede."""

    def __init__(self, options=None):
        super().__init__(options)
        self.envelopes = []

    def capture_envelope(self, envelope):
        self.envelopes.append(envelope)


class EventoDeVerdadeTests(TestCase):
    """
    O SDK ligado de verdade, com o transporte trocado: a exceção da rota de diagnóstico
    vira evento com o release pedido, o ambiente de produção e nada do que veio na requisição.
    """

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.superusuario = User.objects.create_superuser(
            "sa-glitchtip", "sa-glitchtip@test.local", "x-nao-usar-em-prod")
        self.transporte = _TransporteNaMemoria()
        with mock.patch("sys.stderr"):
            ligou = glitchtip.iniciar(
                "https://chave@erros.exemplo.invalid/8", release="abc1234", transport=self.transporte)
        self.assertTrue(ligou)
        self.addCleanup(self._desligar)

    @staticmethod
    def _desligar():
        sentry_sdk.get_client().close()
        sentry_sdk.get_global_scope().set_client(None)

    def _eventos(self):
        sentry_sdk.flush()
        eventos = []
        for envelope in self.transporte.envelopes:
            for item in envelope.items:
                if item.type == "event":
                    eventos.append(item.payload.json)
        return eventos

    def test_opcoes_que_o_contrato_exige(self):
        opcoes = sentry_sdk.get_client().options
        self.assertFalse(opcoes["send_default_pii"])
        self.assertFalse(opcoes["include_local_variables"])
        self.assertEqual(opcoes["max_request_body_size"], "never")
        self.assertEqual(opcoes["max_value_length"], glitchtip.MAX_VALUE_LENGTH)
        self.assertEqual(opcoes["trace_propagation_targets"], [])
        self.assertFalse(opcoes["auto_enabling_integrations"])
        integracoes = set(sentry_sdk.get_client().integrations)
        self.assertIn("django", integracoes)
        for automatica in ("redis", "boto3", "celery", "httpx"):
            self.assertNotIn(automatica, integracoes)
        self.assertIsNone(opcoes["traces_sample_rate"])
        self.assertIsNone(opcoes["traces_sampler"])
        self.assertIsNone(opcoes.get("profiles_sample_rate"))
        self.assertFalse(opcoes["auto_session_tracking"])
        self.assertFalse(opcoes["send_client_reports"])
        self.assertEqual(opcoes["release"], "abc1234")
        self.assertEqual(opcoes["environment"], "production")

    def test_chamada_de_saida_nao_ganha_cabecalho_do_sdk(self):
        """Sem tracing, nada de `sentry-trace`/`baggage` no Conecta ID."""
        import http.server
        import threading
        import urllib.request

        recebidos = {}

        class Destino(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                recebidos.update({k.lower(): v for k, v in self.headers.items()})
                self.send_response(204)
                self.end_headers()

            def log_message(self, *args):
                pass

        servidor = http.server.HTTPServer(("127.0.0.1", 0), Destino)
        threading.Thread(target=servidor.serve_forever, daemon=True).start()
        self.addCleanup(servidor.server_close)
        self.addCleanup(servidor.shutdown)
        urllib.request.urlopen(f"http://127.0.0.1:{servidor.server_port}/api/v1/").read()
        self.assertIn("host", recebidos)
        self.assertNotIn("sentry-trace", recebidos)
        self.assertNotIn("baggage", recebidos)
        self.assertNotIn("traceparent", recebidos)

    def test_excecao_da_rota_chega_limpa_e_com_o_release(self):
        token = str(RefreshToken.for_user(self.superusuario).access_token)
        # Pelo WSGIHandler, como o gunicorn: o Client do Django tem handler próprio e pula a
        # camada WSGI que o SDK usa para anexar a requisição ao evento.
        fabrica = RequestFactory()
        fabrica.cookies["sessionid"] = "cookie-de-sessao-secreto"
        environ = fabrica.post(
            f"{ROTA}?cnpj={CNPJ_LIMPO}&email={EMAIL}&tel=11912345678",
            data=json.dumps({"senha": SENHA, "cnpj": CNPJ, "nome": NOME_LEAD, "telefone": TELEFONE}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_FORWARDED_FOR="200.200.200.200",
            HTTP_X_REAL_IP="200.200.200.200",
        ).environ
        status = []
        # Como o ClientHandler do Django: sem isto o fim da requisição fecha a conexão do TestCase.
        request_started.disconnect(close_old_connections)
        request_finished.disconnect(close_old_connections)
        try:
            with self.assertLogs("django.request", level="ERROR"):
                resposta = WSGIHandler()(environ, lambda codigo, cabecalhos, *_: status.append(codigo))
                b"".join(resposta)
                resposta.close()
        finally:
            request_started.connect(close_old_connections)
            request_finished.connect(close_old_connections)
        self.assertTrue(status[0].startswith("500"), status)

        eventos = self._eventos()
        self.assertEqual(len(eventos), 1)
        evento = eventos[0]
        self.assertEqual(evento["release"], "abc1234")
        self.assertEqual(evento["environment"], "production")
        self.assertEqual(evento["exception"]["values"][-1]["type"], "ErroDeTesteDoGlitchTip")

        texto = json.dumps(evento, ensure_ascii=False)
        for dado in (token, "cookie-de-sessao-secreto", SENHA, CNPJ, CNPJ_LIMPO, EMAIL,
                     NOME_LEAD, TELEFONE, "11912345678", "200.200.200.200",
                     "sa-glitchtip@test.local"):
            with self.subTest(dado=dado):
                self.assertNotIn(dado, texto)
        self.assertNotIn("user", evento)
        self.assertNotIn("data", evento["request"])
        self.assertNotIn("query_string", evento["request"])
        self.assertTrue(evento["request"]["url"].endswith(ROTA))
        self.assertEqual(evento["request"]["method"], "POST")
        self.assertNotIn("Authorization", evento["request"].get("headers", {}))
        self.assertNotIn("request", evento.get("_meta", {}))
        tipos = {item.type for envelope in self.transporte.envelopes for item in envelope.items}
        self.assertEqual(tipos, {"event"})
