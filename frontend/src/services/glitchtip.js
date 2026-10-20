/**
 * Erros do front no GlitchTip da SEJA AP (TSK-1147), sem dado pessoal.
 *
 * O GlitchTip (https://erros.sejaap.com.br, projeto `crm`) fala o protocolo do
 * Sentry, então o cliente é o `@sentry/react`. Só liga com `VITE_SENTRY_DSN` no
 * build: sem ele (dev, testes, build local) o SDK nem é iniciado e nada sai do
 * navegador. O release é `VITE_SENTRY_RELEASE`, o mesmo commit (GIT_COMMIT) que
 * o backend usa. É o padrão do Conecta (TSK-1136), adaptado ao CRM.
 *
 * LGPD: o evento não pode carregar dado de lead nem de quem usa.
 * - `sendDefaultPii: false`, o `dataCollection` todo fechado e nenhum `setUser`;
 * - integrações escolhidas a dedo: sem rastro de console (log leva nome de
 *   lead) nem de clique (o seletor leva o texto do card), sem sessões, sem
 *   tracing e sem replay;
 * - `limparEvento` (o `beforeSend`) e `limparRastro` (o `beforeBreadcrumb`)
 *   tiram a query string das URLs (o token do link de `/definir-senha` vem
 *   nela), deixam só cabeçalhos de uma lista fechada e mascaram CNPJ, CPF,
 *   e-mail, telefone de lead (com e sem DDI e DDD, com e sem máscara, o do
 *   WhatsApp também), token, chave de API e o `DETAIL` do Postgres em qualquer
 *   texto, além do valor de toda chave com nome sensível (senha, token, nome,
 *   telefone, contato...), também dentro de JSON ou formulário em texto;
 * - promessa rejeitada com objeto só leva nome, mensagem, código e status.
 *
 * O IP de quem usa NÃO se resolve aqui: o GlitchTip grava o IP da conexão por
 * cima do que o evento trouxer, e quem o tira é o `scrub_config` do projeto,
 * no servidor.
 *
 * As regras espelham `backend/config/glitchtip.py`: mudou uma, mude a outra.
 */
import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
} from "@sentry/react";

// Só o que se usa, por nome: passar o `import * as Sentry` adiante levaria o SDK
// inteiro (replay, feedback, tracing) para o bundle, ~5 vezes maior.
const SDK = {
  init,
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  eventFiltersIntegration,
  functionToStringIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
};

export const FILTRADO = "[Filtrado]";

const CHAVE_SENSIVEL = new RegExp(
  [
    "senha|password|passwd|pwd|secret|segredo|token|authori[sz]ation|auth|cookie|",
    "session|sessao|sessão|csrf|chave|api[_-]?key|app[_-]?key|jwt|dsn|signature|assinatura|",
    "cpf|cnpj|e-?mail|telefone|celular|phone|fone|whats|first_name|last_name|full_name|username|",
    "nome|razao|razão|contato|responsavel|responsável|indicador|consultor|empresa|",
    "endereco|endereço|munic|notas|observa|motivo",
  ].join(""),
  "i",
);

const CABECALHOS_PERMITIDOS = new Set([
  "accept",
  "accept-language",
  "content-type",
  "referer",
  "user-agent",
]);

const NOMES_SENSIVEIS = CHAVE_SENSIVEL.source;

// Partes das máscaras de chave. Valor entre aspas, com escape e com o `b` de
// bytes (b'...'); o fim do texto vale como aspa de fechamento.
const CHAVE_ENTRE_ASPAS = `(?:"[^"\\n]{0,64}?(?:${NOMES_SENSIVEIS})[^"\\n]{0,64}?"|'[^'\\n]{0,64}?(?:${NOMES_SENSIVEIS})[^'\\n]{0,64}?')`;
const VALOR_ASPAS_DUPLAS = `b?"(?:[^"\\\\]|\\\\.)*(?:"|\\\\?$)`;
const VALOR_ASPAS_SIMPLES = `b?'(?:[^'\\\\]|\\\\.)*(?:'|\\\\?$)`;
// Lista ou objeto como valor ({'nome': ['Padaria'], "responsavel": {...}}): sai
// até o fecho, ou até 2000 caracteres e o fim da linha (sem fecho, sem backtracking).
const VALOR_LISTA_OU_OBJETO = "(?:\\[[^\\]\\n]{0,2000}\\]?|\\{[^\\}\\n]{0,2000}\\}?)";
// Letra, número ou _, com acento: o `\w` do JS é só ASCII, e a chave pode ser
// `observação` ou `município` (no Python o `\w` já é assim).
const LETRA = "[\\p{L}\\p{N}_]";
// Valor sem aspas: vai até o fim da linha ou até a próxima `chave=`/`chave:`
// (depois de espaço, vírgula, ponto e vírgula ou &). Aspas, apóstrofo, parêntese,
// vírgula e & no meio são do valor (razão social, `notas` em texto livre).
const VALOR_SEM_ASPAS = `(?:(?![,;&\\s][ \\t]{0,3}[\\p{L}\\p{N}_-]{1,40}[ \\t]{0,3}[:=])[^\\n])+`;

// Só para texto que não é código: nas linhas de código dos frames, `senha = ...`
// é nome de variável, e a máscara o estragaria.
const MASCARAS_DE_CHAVE = [
  // Chave sensível dentro de um TEXTO: JSON ou objeto, com qualquer par de aspas
  // na chave e no valor. Os trechos de nome têm teto ({0,64}, {0,40}) para a
  // regex não ficar quadrática. O fim do texto vale como aspa de fechamento: num
  // texto cortado, o valor que ficou aberto sai inteiro como [Filtrado], mesmo
  // com o corte logo depois da barra de um escape.
  [new RegExp(`(${CHAVE_ENTRE_ASPAS}\\s*:\\s*)${VALOR_ASPAS_DUPLAS}`, "gi"), '$1"[Filtrado]"'],
  [new RegExp(`(${CHAVE_ENTRE_ASPAS}\\s*:\\s*)${VALOR_ASPAS_SIMPLES}`, "gi"), "$1'[Filtrado]'"],
  [new RegExp(`(${CHAVE_ENTRE_ASPAS}\\s*:\\s*)${VALOR_LISTA_OU_OBJETO}`, "gi"), "$1[Filtrado]"],
  // Formulário, query, argumento nomeado e texto de log: senha=..., nome='...',
  // `senha: ...`, `password = ...`, `Authorization: Basic ...`.
  [
    new RegExp(
      `((?<!${LETRA})${LETRA}{0,40}?(?:${NOMES_SENSIVEIS})${LETRA}{0,40}?[ \\t]{0,3}[:=][ \\t]{0,3})` +
        `(?:b?'(?:[^'\\\\\\n]|\\\\.)*(?:'|$)|b?"(?:[^"\\\\\\n]|\\\\.)*(?:"|$)|` +
        `${VALOR_LISTA_OU_OBJETO}|${VALOR_SEM_ASPAS})`,
      "giu",
    ),
    "$1[Filtrado]",
  ],
];

// Separador de telefone: espaço, ponto ou hífen, no máximo um entre os blocos.
const SEP = "[ .\\-]?";

const MASCARAS_DE_DADO = [
  // Erro do Postgres repassado pela API traz a linha recusada inteira: do
  // `DETAIL:` em diante nada sai (nem a coluna do `Key (...)`); fora dele, o
  // valor do `Key (coluna)=(valor)` some e a coluna fica.
  [/DETAIL:[\s\S]*/g, "DETAIL: [Filtrado]"],
  [/Failing row contains \([\s\S]*/g, "Failing row contains ([Filtrado])"],
  [/(\bKey \([^)]{0,200}\))=\((?:[^()]|\([^()]*(?:\)|$))*(?:\)|$)/g, "$1=([Filtrado])"],
  // O repr de um Cliente no backend é o nome do lead.
  [/<(Cliente|User|VinculoIdentidade|ApiKey): [^<>\n]{0,200}(?:>|$)/g, "<$1: [Filtrado]>"],
  [/\bbearer\s+[^\s,;"']+/gi, "Bearer [token]"],
  [/\bapi-key\s+[^\s,;"']+/gi, "Api-Key [token]"],
  [/\bappkey\s+[^\s,;"']+/gi, "AppKey [token]"],
  // Chave de API do CRM em qualquer texto: `crm_<prefixo>_<segredo>`.
  [/\bcrm_[a-z0-9]{8}_[\w-]+/g, "[api-key]"],
  // Sem exigir os dois pontos: um JWT cortado ao meio continua reconhecível.
  [/\beyJ[\w-]+(?:\.[\w-]*)*/g, "[token]"],
  // Partes com teto (64 e 253, os do RFC): sem ele a regex fica quadrática.
  [/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g, "[e-mail]"],
  // CNPJ numérico com a máscara inteira, parcial ou nenhuma.
  [/\b\d{2}\.?\d{3}\.?\d{3}[/.]?\d{4}-?\d{2}\b/g, "[CNPJ]"],
  // CNPJ alfanumérico, em maiúsculas ou minúsculas. Sem máscara, com um dígito nas
  // 12 primeiras posições (não pega `handleSubmit01`).
  // Com máscara inteira ou parcial: pelo menos um separador (., / ou -).
  [/\b(?=[A-Z0-9]{2,14}[./-])[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}[/.]?[A-Z0-9]{4}-?\d{2}\b/gi, "[CNPJ]"],
  [/\b(?=[A-Z0-9]{0,11}\d)[A-Z0-9]{12}\d{2}\b/gi, "[CNPJ]"],
  // CPF com a máscara inteira, parcial ou nenhuma.
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]"],
  // Telefone com DDD, com ou sem DDI (+55, 0055 ou 55 colado, como no link do
  // WhatsApp), com ou sem parênteses e zero de operadora, com ou sem o nono dígito.
  [
    new RegExp(
      `(?<![\\w+])(?:(?:\\+|00) ?55${SEP}|55${SEP})?(?:\\(0?[1-9]\\d\\)|0?[1-9]\\d)${SEP}` +
        `(?:9${SEP}\\d{4}|[2-9]\\d{3})${SEP}\\d{4}(?!\\w)`,
      "g",
    ),
    "[telefone]",
  ],
  // Sem DDD: o celular de nove dígitos, o fixo de oito, que começa de 2 a 5, e o
  // celular antigo de oito, de 6 a 9, só com separador. Um intervalo de anos
  // (2025-2026) não é telefone.
  [new RegExp(`(?<![\\w+.\\-])9${SEP}\\d{4}${SEP}\\d{4}(?!\\w)`, "g"), "[telefone]"],
  [
    new RegExp(`(?<![\\w+.\\-])(?!(?:19|20)\\d\\d${SEP}(?:19|20)\\d\\d(?!\\w))(?:[2-5]\\d{3}${SEP}|[6-9]\\d{3}[ .\\-])\\d{4}(?!\\w)`, "g"),
    "[telefone]",
  ],
];

const PROFUNDIDADE = 20;

// Teto de cada texto: a limpeza roda no navegador de quem está vendo o erro. As
// máscaras rodam sobre um pouco mais que isso (a folga), e só depois vem o corte
// final. (O SDK do navegador não corta nada antes: `maxValueLength` não é usado.)
export const TAMANHO_MAXIMO = 16384;
export const FOLGA_DAS_MASCARAS = 1024;

// Linhas do código em volta do erro: passam pelas máscaras de dado, mas não
// pelas de chave em texto.
const CONTEXTO_DE_CODIGO = new Set(["pre_context", "context_line", "post_context"]);

// Caracteres de que CPF, CNPJ, e-mail, telefone, JWT e URL são feitos.
const CARACTERE_DE_DADO = /[\p{L}\p{N}_.%+\-@/=:()]/u;

/**
 * Tira do fim a sequência de caracteres de dado que o corte pode ter partido:
 * um "123.456.7", um "+55 (11) 9123" ou um "fulana@empre" já não casam com a
 * máscara. O espaço só conta entre blocos de telefone (depois de dígito ou de
 * parêntese).
 */
function semRestoCortado(texto) {
  let fim = texto.length;
  while (
    fim > 0 &&
    (CARACTERE_DE_DADO.test(texto[fim - 1]) ||
      (texto[fim - 1] === " " && fim > 1 && /[0-9)]/.test(texto[fim - 2])))
  ) {
    fim -= 1;
  }
  return texto.slice(0, fim).trimEnd();
}

/**
 * Troca CNPJ, CPF, e-mail, telefone e token dentro de um texto qualquer. O
 * corte vem DEPOIS das máscaras, e o que um corte partir ao meio sai inteiro.
 * `codigo` (linha de código de um frame) pula as máscaras de chave em texto.
 */
export function mascararTexto(texto, codigo = false) {
  let atual = texto;
  let cortado = false;
  if (atual.length > TAMANHO_MAXIMO + FOLGA_DAS_MASCARAS) {
    atual = semRestoCortado(atual.slice(0, TAMANHO_MAXIMO + FOLGA_DAS_MASCARAS));
    cortado = true;
  }
  const grupos = codigo ? [MASCARAS_DE_DADO] : [MASCARAS_DE_CHAVE, MASCARAS_DE_DADO];
  for (const grupo of grupos) {
    for (const [padrao, troca] of grupo) atual = atual.replace(padrao, troca);
  }
  if (atual.length > TAMANHO_MAXIMO) {
    atual = semRestoCortado(atual.slice(0, TAMANHO_MAXIMO));
    cortado = true;
  }
  return cortado ? `${atual} [cortado]` : atual;
}

function semQuery(url) {
  if (typeof url !== "string") return url;
  return url.split("?")[0].split("#")[0];
}

function varrer(valor, profundidade = 0, codigo = false) {
  if (profundidade > PROFUNDIDADE) return FILTRADO;
  if (typeof valor === "string") return mascararTexto(valor, codigo);
  if (Array.isArray(valor)) return valor.map((item) => varrer(item, profundidade + 1, codigo));
  if (valor && typeof valor === "object") {
    const limpo = {};
    for (const [chave, item] of Object.entries(valor)) {
      if (CHAVE_SENSIVEL.test(chave)) limpo[chave] = FILTRADO;
      else limpo[chave] = varrer(item, profundidade + 1, codigo || CONTEXTO_DE_CODIGO.has(chave));
    }
    return limpo;
  }
  return valor;
}

function limparRequisicao(requisicao) {
  if (!requisicao || typeof requisicao !== "object") return undefined;
  const cabecalhos = {};
  for (const [nome, valor] of Object.entries(requisicao.headers || {})) {
    if (CABECALHOS_PERMITIDOS.has(nome.toLowerCase())) {
      cabecalhos[nome] = nome.toLowerCase() === "referer" ? semQuery(valor) : valor;
    }
  }
  const limpa = { url: semQuery(requisicao.url), method: requisicao.method, headers: cabecalhos };
  return Object.fromEntries(Object.entries(limpa).filter(([, valor]) => valor));
}

function limparDadosDeRastro(dados) {
  if (!dados || typeof dados !== "object") return dados;
  const limpos = { ...dados };
  for (const campo of ["url", "to", "from"]) {
    if (campo in limpos) limpos[campo] = semQuery(limpos[campo]);
  }
  return limpos;
}

/** `beforeBreadcrumb`: rastro de rede e de navegação sem query string. */
export function limparRastro(rastro) {
  if (!rastro) return rastro;
  if (rastro.category === "console" || (rastro.category || "").startsWith("ui.")) return null;
  return { ...rastro, data: limparDadosDeRastro(rastro.data) };
}

// Promessa rejeitada com objeto que não é Error: o SDK o serializa em
// `extra.__serialized__`, e um AxiosError espalhado levaria config (corpo e
// cabeçalhos), request e response. Só sai o que descreve o erro.
const SERIALIZADO_PERMITIDO = ["name", "message", "code", "status"];

function limparSerializado(extra) {
  if (!extra || typeof extra !== "object" || !("__serialized__" in extra)) return extra;
  const serializado = extra.__serialized__;
  const permitido =
    serializado && typeof serializado === "object"
      ? Object.fromEntries(
          SERIALIZADO_PERMITIDO.filter((campo) => campo in serializado).map((campo) => [
            campo,
            serializado[campo],
          ]),
        )
      : FILTRADO;
  return { ...extra, __serialized__: permitido };
}

// Campos do próprio SDK, que não carregam dado de ninguém e não passam pelas
// máscaras: um debug ID como `01191234-5678-...` viraria "[telefone]-..." e o
// frame perderia o source map.
const CAMPOS_DO_SDK = ["event_id", "release", "dist", "environment", "timestamp", "start_timestamp", "debug_meta", "sdk"];

/** `beforeSend`: o evento sai sem dado pessoal (ver o JSDoc do módulo). */
export function limparEvento(evento) {
  if (!evento || typeof evento !== "object") return evento;
  const copia = { ...evento };
  delete copia.user;
  if ("extra" in copia) copia.extra = limparSerializado(copia.extra);
  if ("request" in copia) {
    const requisicao = limparRequisicao(copia.request);
    if (requisicao) copia.request = requisicao;
    else delete copia.request;
  }
  if (Array.isArray(copia.breadcrumbs)) {
    copia.breadcrumbs = copia.breadcrumbs.map((rastro) => ({
      ...rastro,
      data: limparDadosDeRastro(rastro.data),
    }));
  }
  const guardados = {};
  for (const campo of CAMPOS_DO_SDK) {
    if (campo in copia) {
      guardados[campo] = copia[campo];
      delete copia[campo];
    }
  }
  let rastreio;
  if (copia.contexts && typeof copia.contexts === "object" && "trace" in copia.contexts) {
    ({ trace: rastreio, ...copia.contexts } = copia.contexts);
  }
  const limpo = { ...varrer(copia), ...guardados };
  if (rastreio !== undefined) limpo.contexts = { ...limpo.contexts, trace: rastreio };
  return limpo;
}

/**
 * Dispara um erro não tratado de dentro do bundle, para conferir o GlitchTip
 * depois do deploy: no console do navegador, `crmErroDeTesteGlitchtip()`. O
 * `setTimeout` faz o erro nascer neste arquivo, e não no console: é o que prova
 * que a stacktrace volta ao fonte original pelos source maps.
 */
function erroDeTeste() {
  setTimeout(() => {
    throw new Error("Erro de teste do GlitchTip (TSK-1147), disparado no console");
  }, 0);
}

/**
 * Liga o SDK. Sem DSN não faz nada e devolve false.
 * @param {Record<string, string|undefined>} [ambiente] o `import.meta.env` do build.
 * @param {typeof SDK} [sdk] as funções do `@sentry/react`; o teste passa falsas.
 */
export function iniciarGlitchtip(ambiente = import.meta.env, sdk = SDK) {
  const dsn = (ambiente?.VITE_SENTRY_DSN || "").trim();
  if (!dsn) return false;

  sdk.init({
    dsn,
    release: (ambiente.VITE_SENTRY_RELEASE || "").trim() || undefined,
    environment: (ambiente.VITE_SENTRY_ENVIRONMENT || "").trim() || "production",
    sendDefaultPii: false,
    // Nesta versão do SDK é o `dataCollection` que decide o que se coleta, e o
    // padrão dele é coletar tudo, inclusive pedir ao servidor que grave o IP
    // (`infer_ip: auto`). Tudo fechado, explícito.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    sendClientReports: false,
    // Sem `tracesSampleRate`: tracing desligado. Lista fechada no lugar das
    // padrão, que trazem console, sessões e contexto de idioma.
    defaultIntegrations: false,
    integrations: [
      sdk.eventFiltersIntegration(),
      sdk.functionToStringIntegration(),
      sdk.browserApiErrorsIntegration(),
      sdk.breadcrumbsIntegration({ console: false, dom: false }),
      sdk.globalHandlersIntegration(),
      sdk.linkedErrorsIntegration(),
      sdk.dedupeIntegration(),
      sdk.httpContextIntegration(),
    ],
    beforeBreadcrumb: limparRastro,
    beforeSend: limparEvento,
  });

  if (typeof window !== "undefined") {
    window.crmErroDeTesteGlitchtip = erroDeTeste;
  }
  return true;
}
