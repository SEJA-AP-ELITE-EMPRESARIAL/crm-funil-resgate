/**
 * glitchtip.test.js — erros do front no GlitchTip sem dado pessoal (TSK-1147).
 *
 * Roda no `node --test` (npm test), sem navegador:
 * 1. `limparEvento` (o beforeSend) mascara CNPJ, CPF, e-mail, telefone de lead,
 *    nome em chave=valor, senha e token, e tira Authorization, cookies e a query
 *    string das URLs.
 * 2. Sem VITE_SENTRY_DSN o SDK não é iniciado: dev e testes não mandam nada.
 * 3. Com DSN, o init sai fechado: sem PII, sem tracing, sem rastro de console
 *    nem de clique, com o release do build.
 */
import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  FILTRADO,
  FOLGA_DAS_MASCARAS,
  TAMANHO_MAXIMO,
  iniciarGlitchtip,
  limparEvento,
  limparRastro,
  mascararTexto,
} from "./glitchtip.js";

const CNPJ = "12.345.678/0001-95";
const CNPJ_LIMPO = "12345678000195";
const CPF = "123.456.789-09";
const EMAIL = "fulana.lead@empresa.com.br";
const TELEFONE = "(11) 91234-5678";
const SENHA = "Senha-Secreta-123";
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjo0Mn0.c2lnbmF0dXJh";
const CHAVE_API = `crm_ab12cd34_${"s".repeat(32)}`;
const NOME_LEAD = "Padaria Pao Quente";

// Os mesmos formatos do teste do backend (apps/crm/tests/test_glitchtip.py).
const TELEFONES = [
  ["+55 (11) 91234-5678", "91234"],
  ["+55 11 91234-5678", "91234"],
  ["+55 11 9 1234-5678", "1234-5678"],
  ["+5511912345678", "912345678"],
  ["5511912345678", "912345678"],
  ["0055 11 912345678", "912345678"],
  ["551132345678", "32345678"],
  ["+55 (11) 3234-5678", "3234"],
  ["(11) 91234-5678", "91234"],
  ["(11)91234-5678", "91234"],
  ["(11) 912345678", "912345678"],
  ["(011) 91234-5678", "91234"],
  ["(11) 3234-5678", "3234"],
  ["11 91234-5678", "91234"],
  ["11 9 1234 5678", "1234 5678"],
  ["11.91234.5678", "91234"],
  ["11-91234-5678", "91234"],
  ["11912345678", "912345678"],
  ["1132345678", "32345678"],
  ["11 3234-5678", "3234"],
  ["11 32345678", "32345678"],
  ["91234-5678", "91234"],
  ["9 1234-5678", "1234-5678"],
  ["912345678", "912345678"],
  ["3234-5678", "3234"],
  ["3234 5678", "3234"],
  ["32345678", "32345678"],
  ["8123-4567", "8123"],
  ["https://wa.me/5511912345678", "912345678"],
  ["https://api.whatsapp.com/send?phone=5511912345678", "912345678"],
];

function eventoComDadoPessoal() {
  return {
    message: `Falha ao salvar ${CNPJ} de ${EMAIL} (${TELEFONE})`,
    exception: {
      values: [{ type: "Error", value: `CPF ${CPF} inválido, CNPJ ${CNPJ_LIMPO}` }],
    },
    request: {
      url: `https://conecta-crm.sejaap.com.br/definir-senha?token=${JWT}#x`,
      headers: {
        Authorization: `Bearer ${JWT}`,
        Cookie: "sessionid=abc123",
        "User-Agent": "Mozilla/5.0",
        Referer: `https://conecta-crm.sejaap.com.br/?busca=${EMAIL}`,
      },
      cookies: { sessionid: "abc123" },
      data: { senha: SENHA },
    },
    user: { id: 42, email: EMAIL },
    extra: { senha: SENHA, detalhe: `token ${JWT}, whatsapp +55 11 98765-4321`, nome: NOME_LEAD },
    breadcrumbs: [
      { category: "xhr", data: { url: `/api/crm/clientes/?search=${NOME_LEAD}`, method: "GET" } },
      { category: "navigation", data: { from: `/definir-senha?token=${JWT}`, to: "/?busca=1" } },
    ],
  };
}

describe("limparEvento", () => {
  const limpo = limparEvento(eventoComDadoPessoal());
  const texto = JSON.stringify(limpo);

  for (const dado of [CNPJ, CNPJ_LIMPO, CPF, EMAIL, TELEFONE, "98765-4321", SENHA, JWT, NOME_LEAD, "abc123"]) {
    it(`não deixa ${dado.slice(0, 20)} em lugar nenhum do evento`, () => {
      assert.ok(!texto.includes(dado));
    });
  }

  it("troca CNPJ, CPF, e-mail e telefone por marcadores legíveis", () => {
    assert.equal(limpo.message, "Falha ao salvar [CNPJ] de [e-mail] ([telefone])");
    assert.equal(limpo.exception.values[0].value, "CPF [CPF] inválido, CNPJ [CNPJ]");
  });

  it("tira Authorization e Cookie e deixa só a lista fechada de cabeçalhos", () => {
    assert.deepEqual(Object.keys(limpo.request.headers).sort(), ["Referer", "User-Agent"]);
    assert.equal(limpo.request.headers.Referer, "https://conecta-crm.sejaap.com.br/");
  });

  it("tira corpo, cookies, usuário e a query string (o token do link) da URL", () => {
    assert.ok(!("data" in limpo.request));
    assert.ok(!("cookies" in limpo.request));
    assert.ok(!("user" in limpo));
    assert.equal(limpo.request.url, "https://conecta-crm.sejaap.com.br/definir-senha");
  });

  it("filtra o valor de chave sensível e limpa a URL dos rastros", () => {
    assert.equal(limpo.extra.senha, FILTRADO);
    assert.equal(limpo.extra.nome, FILTRADO);
    assert.equal(limpo.extra.detalhe, "token [token], whatsapp [telefone]");
    assert.equal(limpo.breadcrumbs[0].data.url, "/api/crm/clientes/");
    assert.deepEqual(limpo.breadcrumbs[1].data, { from: "/definir-senha", to: "/" });
  });

  it("telefone de lead em todos os formatos", () => {
    for (const [telefone, pedaco] of TELEFONES) {
      const saida = mascararTexto(`ligar para ${telefone} hoje`);
      assert.ok(!saida.includes(pedaco), `${telefone} -> ${saida}`);
      assert.ok(saida.startsWith("ligar para "), saida);
      // Em `phone=...` a máscara de chave leva o valor e as palavras soltas depois.
      if (!telefone.includes("=")) assert.ok(saida.endsWith(" hoje"), saida);
    }
  });

  it("texto comum com números não vira telefone", () => {
    for (const comum of [
      "Periodo 01 2025-2026",
      "anos 2025 2026",
      "versão 2.72.0",
      "linha 1234 de 5678",
      "R$ 12.345,67",
      "2026-10-20T19:38:00",
      "porta 11470",
      "TypeError: Cannot read properties of undefined (reading 'map') em 2026",
    ]) {
      assert.equal(mascararTexto(comum), comum);
    }
  });

  it("nome de lead em chave=valor, JSON, objeto e repr", () => {
    assert.equal(mascararTexto("nome=Padaria+X&etapa=ok"), "nome=[Filtrado]&etapa=ok");
    assert.equal(mascararTexto(`{"nome": "${NOME_LEAD}", "etapa": "ok"}`), '{"nome": "[Filtrado]", "etapa": "ok"}');
    assert.equal(
      mascararTexto(`{'indicador_nome': '${NOME_LEAD}', 'etapa': 'ok'}`),
      "{'indicador_nome': '[Filtrado]', 'etapa': 'ok'}",
    );
    assert.equal(
      mascararTexto("quem_fara_contato=Joana indicador_whatsapp=11912345678"),
      "quem_fara_contato=[Filtrado] indicador_whatsapp=[Filtrado]",
    );
    assert.equal(mascararTexto(`erro em <Cliente: ${NOME_LEAD}>`), "erro em <Cliente: [Filtrado]>");
  });

  it("chave=valor com aspas misturadas, escape, bytes e espaços", () => {
    const casos = [
      [`{'nome': "Padaria D'Ouro", 'etapa': 'ok'}`, `{'nome': "[Filtrado]", 'etapa': 'ok'}`],
      ["Cliente(nome='Maria D\\'Avila', x=1)", "Cliente(nome=[Filtrado], x=1)"],
      ["{'senha': b'abc'}", "{'senha': '[Filtrado]'}"],
      ["nome=Padaria Pao Quente etapa=priorizado", "nome=[Filtrado] etapa=priorizado"],
      ["endereço=Rua das Flores 123", "endereço=[Filtrado]"],
      ["senha: Minha123", "senha: [Filtrado]"],
      ["password = hunter2", "password = [Filtrado]"],
      ["notas=ligar depois do almoço", "notas=[Filtrado]"],
      ["Authorization: Basic dXNlcjpwYXNz", "Authorization: [Filtrado]"],
      ["Authorization: Token abc123", "Authorization: [Filtrado]"],
      // Pontuação de razão social e de texto livre é do valor; chave com acento.
      ["nome=Padaria D'Ouro Ltda etapa=x", "nome=[Filtrado] etapa=x"],
      ["nome: Padaria São João & Filhos", "nome: [Filtrado]"],
      ["nome_fantasia: Padaria (Centro) Ltda", "nome_fantasia: [Filtrado]"],
      ["notas=Cliente bravo, ligar amanhã", "notas=[Filtrado]"],
      ["observação: Cliente pediu desconto", "observação: [Filtrado]"],
      ["município: São Paulo", "município: [Filtrado]"],
      ["https://x/?nome=Padaria&id=3", "https://x/?nome=[Filtrado]&id=3"],
      // Lista ou objeto como valor.
      // O resto do texto vai junto: o fecho da lista não é confiável.
      ["<QueryDict: {'nome': ['Padaria do João'], 'etapa': ['x']}>", "<QueryDict: {'nome': [Filtrado]"],
      ['{"nome": ["Padaria [Centro] São João"], "etapa": "x"}', '{"nome": [Filtrado]'],
      ['{"nomes": [["Ana", "Bia"], ["Cia"]]}', '{"nomes": [Filtrado]'],
      ['{"responsavel": {"first_name": "Maria", "last_name": "Souza"}}', '{"responsavel": [Filtrado]'],
      ["erro {'nome': ['Padaria']}\nlinha seguinte", "erro {'nome': [Filtrado]"],
      ['{\n  "nome": [\n    "Padaria do João"\n  ],\n  "etapa": "x"\n}', '{\n  "nome": [Filtrado]'],
      ['nome=[\n"Padaria do João"\n]', "nome=[Filtrado]"],
      ["username=maria.souza first_name=Maria", "username=[Filtrado] first_name=[Filtrado]"],
    ];
    for (const [texto, esperado] of casos) assert.equal(mascararTexto(texto), esperado);
    for (const comum of ["erro: algo deu errado", "status=500 detail=x"]) assert.equal(mascararTexto(comum), comum);
  });

  it("CNPJ e CPF com máscara parcial ou em minúsculas", () => {
    for (const cnpj of ["12345678/0001-95", "12.345.678/000195", "12.345.678.0001-95", "12abc34501de35", "12.abc.345/01de-35",
      "12ABC345/01DE-35", "12.ABC.345/01DE35", "12ABC34501DE-35", "12.ABC.34501DE35"]) {
      assert.equal(mascararTexto(`cnpj ${cnpj} ok`), "cnpj [CNPJ] ok");
    }
    for (const cpf of ["123456789-09", "123.456.78909"]) assert.equal(mascararTexto(`cpf ${cpf} ok`), "cpf [CPF] ok");
    assert.equal(mascararTexto("handleSubmit01"), "handleSubmit01");
  });

  it("campos do SDK não passam pelas máscaras (debug ID que parece telefone)", () => {
    const debugId = "01191234-5678-4abc-8def-0123456789ab";
    const evento = limparEvento({
      event_id: "01191234567812345678901234567890",
      release: "1132345678",
      debug_meta: { images: [{ debug_id: debugId }] },
      contexts: { trace: { trace_id: "01191234-5678" }, outro: { telefone: "x" } },
    });
    assert.equal(evento.debug_meta.images[0].debug_id, debugId);
    assert.equal(evento.release, "1132345678");
    assert.deepEqual(evento.contexts.trace, { trace_id: "01191234-5678" });
    assert.deepEqual(evento.contexts.outro, { telefone: FILTRADO });
  });

  it("chave de API, AppKey e Bearer em texto", () => {
    assert.equal(mascararTexto(`cabeçalho Api-Key ${CHAVE_API}`), "cabeçalho Api-Key [token]");
    assert.equal(mascararTexto(`vazou ${CHAVE_API} aqui`), "vazou [api-key] aqui");
    assert.equal(mascararTexto("AppKey crm:segredo"), "AppKey [token]");
  });

  it("tira a linha e o valor da chave do erro do Postgres", () => {
    const erro =
      'null value in column "x" violates not-null constraint\nDETAIL:  Failing row contains (1, Padaria Pao Quente, 11 91234-5678).';
    assert.equal(mascararTexto(erro), 'null value in column "x" violates not-null constraint\nDETAIL: [Filtrado]');
    assert.equal(mascararTexto("Key (nome)=(Maria Souza) already exists."), "Key (nome)=([Filtrado]) already exists.");
  });

  it("rejeição com objeto só leva o que descreve o erro", () => {
    const evento = limparEvento({
      exception: { values: [{ type: "UnhandledRejection", value: "Object captured as promise rejection" }] },
      extra: {
        __serialized__: {
          message: "Request failed with status code 500",
          code: "ERR_BAD_RESPONSE",
          status: 500,
          name: "AxiosError",
          config: {
            url: "/api/crm/clientes/",
            data: `{"nome":"${NOME_LEAD}","telefone":"${TELEFONE}","email":"${EMAIL}"}`,
            headers: { Authorization: `Bearer ${JWT}` },
          },
          response: { data: { nome: NOME_LEAD } },
        },
      },
    });
    assert.deepEqual(evento.extra.__serialized__, {
      name: "AxiosError",
      message: "Request failed with status code 500",
      code: "ERR_BAD_RESPONSE",
      status: 500,
    });
    assert.ok(!JSON.stringify(evento).includes("Padaria"));
  });

  it("linha de código passa pelas máscaras de dado e não pelas de chave", () => {
    const frame = {
      context_line: '    enviarAviso("fulana@empresa.com.br", "+55 (11) 91234-5678")',
      post_context: ["    clientes.filter(telefone=telefoneLimpo, nome=nomeDigitado)"],
    };
    const evento = limparEvento({ exception: { values: [{ stacktrace: { frames: [frame] } }] } });
    const saida = evento.exception.values[0].stacktrace.frames[0];
    assert.equal(saida.context_line, '    enviarAviso("[e-mail]", "[telefone]")');
    assert.deepEqual(saida.post_context, frame.post_context);
  });

  it("dado na posição do corte não sai pela metade", () => {
    const limite = TAMANHO_MAXIMO + FOLGA_DAS_MASCARAS;
    const emVolta = (dado, posicao, tamanho) =>
      "x ".repeat(tamanho).slice(0, posicao) + dado + " fim".repeat(tamanho / 4);
    for (const dado of ["123.456.789-09", "fulana.lead@empresa.com.br", "+55 (11) 91234-5678", JWT]) {
      for (let parte = 1; parte < dado.length; parte += 1) {
        for (const posicao of [limite - parte, TAMANHO_MAXIMO - parte]) {
          const saida = mascararTexto(emVolta(dado, posicao, limite));
          assert.ok(saida.endsWith(" [cortado]"));
          const pedaco = dado.slice(0, parte);
          // Um único caractere de pontuação ("+", "(") não identifica ninguém.
          if ((pedaco.match(/[\p{L}\p{N}]/gu) || []).length >= 2) {
            assert.ok(!saida.includes(pedaco), `${dado} parte ${parte}`);
          }
        }
      }
    }
  });

  it("valor sensível aberto no corte sai inteiro", () => {
    const limite = TAMANHO_MAXIMO + FOLGA_DAS_MASCARAS;
    const cpfs = "123.456.789-09 ".repeat(200);
    for (const valor of [
      ' {"senha": "Minha senha#2024!"}',
      ' {"nome": "Minha Padaria Querida"}',
      " Key (nome)=(Joana Silva Pereira) already exists",
      ' {"senha": "Minha\\u00e7\\u00e3oForte"}',
      " Key (nome)=(Joana (filha) Silva) already exists",
      " erro em <Cliente: Minha Padaria Querida>",
    ]) {
      for (let parte = 2; parte < valor.length; parte += 1) {
        const texto =
          cpfs + "x ".repeat(9000).slice(0, limite - cpfs.length - parte) + valor + " fim".repeat(3000);
        const saida = mascararTexto(texto);
        assert.ok(!saida.includes("Minha"), `${valor} parte ${parte}`);
        assert.ok(!saida.includes("Joana"), `${valor} parte ${parte}`);
      }
    }
  });

  it("pior caso das regex dentro do limite leva menos de 200 ms", () => {
    const tamanho = TAMANHO_MAXIMO + FOLGA_DAS_MASCARAS;
    const casos = {
      json: '"token'.repeat(tamanho).slice(0, tamanho),
      formulario: "token=".repeat(tamanho).slice(0, tamanho),
      objeto: "{'nome': 'a', ".repeat(tamanho).slice(0, tamanho),
      chaveDoPostgres: "Key (".repeat(tamanho).slice(0, tamanho),
      reprDeCliente: "<Cliente: ".repeat(tamanho).slice(0, tamanho),
      alfanumerico: "a".repeat(tamanho),
      email: "a.".repeat(tamanho).slice(0, tamanho),
      digitos: "1".repeat(tamanho),
      telefone: "+55 (11) 9 ".repeat(tamanho).slice(0, tamanho),
      separadores: "1 2-3.".repeat(tamanho).slice(0, tamanho),
    };
    for (const [nome, texto] of Object.entries(casos)) {
      const inicio = performance.now();
      mascararTexto(texto);
      assert.ok(performance.now() - inicio < 200, nome);
    }
  });
});

describe("limparRastro", () => {
  it("descarta rastro de console e de clique", () => {
    assert.equal(limparRastro({ category: "console", message: EMAIL }), null);
    assert.equal(limparRastro({ category: "ui.click", message: `div[title=${NOME_LEAD}]` }), null);
  });

  it("deixa o rastro de rede sem query string", () => {
    const rastro = limparRastro({ category: "xhr", data: { url: `/api/crm/clientes/?search=${EMAIL}` } });
    assert.equal(rastro.data.url, "/api/crm/clientes/");
  });
});

function sdkFalso() {
  const integracao = (name) => () => ({ name });
  return {
    init: mock.fn(),
    breadcrumbsIntegration: mock.fn(integracao("Breadcrumbs")),
    browserApiErrorsIntegration: integracao("BrowserApiErrors"),
    dedupeIntegration: integracao("Dedupe"),
    eventFiltersIntegration: integracao("EventFilters"),
    functionToStringIntegration: integracao("FunctionToString"),
    globalHandlersIntegration: integracao("GlobalHandlers"),
    httpContextIntegration: integracao("HttpContext"),
    linkedErrorsIntegration: integracao("LinkedErrors"),
  };
}

describe("iniciarGlitchtip", () => {
  it("sem DSN não inicia o SDK (dev e testes não mandam nada)", () => {
    const sdk = sdkFalso();
    assert.equal(iniciarGlitchtip({}, sdk), false);
    assert.equal(iniciarGlitchtip({ VITE_SENTRY_DSN: "   " }, sdk), false);
    assert.equal(iniciarGlitchtip(undefined, sdk), false);
    assert.equal(sdk.init.mock.callCount(), 0);
  });

  it("com DSN inicia fechado: sem PII, sem tracing, com release e limpeza", () => {
    const sdk = sdkFalso();
    const ligou = iniciarGlitchtip(
      { VITE_SENTRY_DSN: "https://chave@erros.exemplo.invalid/8", VITE_SENTRY_RELEASE: "abc1234" },
      sdk,
    );
    assert.equal(ligou, true);
    const opcoes = sdk.init.mock.calls[0].arguments[0];
    assert.equal(opcoes.sendDefaultPii, false);
    // O `dataCollection` vence o sendDefaultPii e, sem ele, coleta usuário, IP e cabeçalhos.
    assert.equal(opcoes.dataCollection.userInfo, false);
    assert.equal(opcoes.dataCollection.cookies, false);
    assert.equal(opcoes.dataCollection.httpHeaders, false);
    assert.deepEqual(opcoes.dataCollection.httpBodies, []);
    assert.equal(opcoes.dataCollection.urlQueryParams, false);
    assert.equal(opcoes.dataCollection.stackFrameVariables, false);
    assert.equal(opcoes.release, "abc1234");
    assert.equal(opcoes.environment, "production");
    assert.equal(opcoes.beforeSend, limparEvento);
    assert.equal(opcoes.beforeBreadcrumb, limparRastro);
    assert.ok(!("tracesSampleRate" in opcoes));
    assert.ok(!("tracesSampler" in opcoes));
    assert.ok(!("replaysSessionSampleRate" in opcoes));
    assert.equal(opcoes.defaultIntegrations, false);
    const nomes = opcoes.integrations.map((integracao) => integracao.name);
    for (const fora of ["Console", "BrowserSession", "BrowserTracing", "Replay"]) {
      assert.ok(!nomes.includes(fora), fora);
    }
    assert.ok(nomes.includes("GlobalHandlers"));
    assert.deepEqual(sdk.breadcrumbsIntegration.mock.calls[0].arguments[0], { console: false, dom: false });
  });

  it("as funções que o init usa existem de verdade no @sentry/react instalado", async () => {
    const Sentry = await import("@sentry/react");
    for (const nome of Object.keys(sdkFalso())) {
      assert.equal(typeof Sentry[nome], "function", nome);
    }
  });
});
