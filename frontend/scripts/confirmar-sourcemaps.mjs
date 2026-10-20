/**
 * Confirma no GlitchTip que os source maps de um release foram montados (TSK-1147).
 *
 * Veio do Conecta (TSK-1136), onde a lição foi aprendida; aqui a pasta é dist/assets.
 *
 * O `sentry-cli sourcemaps upload` sai com 0 assim que o servidor aceita os
 * pedaços, e o GlitchTip monta o pacote depois, numa tarefa que pode falhar
 * calada (foi o que aconteceu no primeiro deploy do Conecta, com o glitchtip-cli). Então
 * o aviso de sucesso só vem daqui: cada debug ID que o `sourcemaps inject`
 * escreveu num `.js` tem de aparecer na lista de arquivos do release,
 * `GET /api/0/organizations/<org>/releases/<release>/files/`.
 *
 * Uso: node scripts/confirmar-sourcemaps.mjs <release> <pasta dos .js>  (padrão: dist/assets)
 * Ambiente: SENTRY_URL, SENTRY_ORG e SENTRY_AUTH_TOKEN (escopo project:releases).
 * Sai com 0 só se o servidor mostrou todos; com 1 se não deu para confirmar.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// O comentário que o `sentry-cli sourcemaps inject` põe no fim de cada .js.
const DEBUG_ID = /\/\/# debugId=([0-9a-fA-F-]{32,36})\s*$/m;

// O GlitchTip escreve o Link como o repr de um set do Python ({'<...>; rel=...'}):
// basta achar o `next` com resultados.
const PROXIMA_PAGINA = /<([^>]+)>;\s*rel="next";\s*results="true"/;

const PAGINAS_NO_MAXIMO = 50;

// Prazo de cada pedido: um GlitchTip que aceita a conexão e não responde não pode
// segurar o build (o padrão do Node espera minutos por pedido).
const PRAZO_DO_PEDIDO_MS = 15000;

/** Debug IDs injetados nos `.js` da pasta (e subpastas), em minúsculas. */
export async function debugIdsInjetados(pasta) {
  const ids = new Set();
  const entradas = await readdir(pasta, { recursive: true, withFileTypes: true });
  for (const entrada of entradas) {
    if (!entrada.isFile() || !entrada.name.endsWith(".js")) continue;
    const conteudo = await readFile(path.join(entrada.parentPath, entrada.name), "utf8");
    const achado = conteudo.match(DEBUG_ID);
    if (achado) ids.add(achado[1].toLowerCase());
  }
  return ids;
}

/**
 * Debug IDs que o servidor tem montados para o release, em minúsculas. Só conta o
 * arquivo que veio com o mapa ligado (cabeçalho `sourcemap`): um .js sozinho não
 * resolve frame nenhum.
 */
export async function debugIdsNoServidor({
  url,
  org,
  token,
  release,
  fetch = globalThis.fetch,
  prazoMs = PRAZO_DO_PEDIDO_MS,
}) {
  const ids = new Set();
  let endereco =
    `${url.replace(/\/+$/, "")}/api/0/organizations/${encodeURIComponent(org)}` +
    `/releases/${encodeURIComponent(release)}/files/?limit=100`;
  for (let pagina = 0; endereco && pagina < PAGINAS_NO_MAXIMO; pagina += 1) {
    const resposta = await fetch(endereco, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(prazoMs),
    });
    if (!resposta.ok) throw new RespostaRecusada(resposta.status);
    for (const arquivo of await resposta.json()) {
      const id = arquivo?.headers?.["debug-id"];
      if (typeof id === "string" && arquivo.headers.sourcemap) ids.add(id.toLowerCase());
    }
    endereco = (resposta.headers.get("link") || "").match(PROXIMA_PAGINA)?.[1];
  }
  return ids;
}

class RespostaRecusada extends Error {
  constructor(status) {
    super(`a API de arquivos do release respondeu ${status}`);
  }
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pergunta ao servidor até ele mostrar todos os debug IDs ou acabarem as
 * tentativas (a montagem é assíncrona). Devolve `{ ok, esperados, montados, motivo }`.
 */
export async function confirmar({
  url,
  org,
  token,
  release,
  pasta,
  tentativas = 24,
  intervaloMs = 5000,
  fetch = globalThis.fetch,
  esperar = dormir,
}) {
  if (!url || !org || !token || !release) {
    return { ok: false, esperados: 0, montados: 0, motivo: "faltou URL, organização, token ou release" };
  }
  const esperados = await debugIdsInjetados(pasta);
  if (esperados.size === 0) {
    return { ok: false, esperados: 0, montados: 0, motivo: "nenhum .js com debug ID injetado" };
  }
  let montados = 0;
  let motivo = "";
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      const noServidor = await debugIdsNoServidor({ url, org, token, release, fetch });
      montados = [...esperados].filter((id) => noServidor.has(id)).length;
      if (montados === esperados.size) return { ok: true, esperados: esperados.size, montados, motivo: "" };
      motivo = `o servidor mostra ${montados} de ${esperados.size}`;
    } catch (erro) {
      // De erro de rede só sai o nome: a mensagem do fetch pode repetir o
      // cabeçalho, com o token.
      motivo = erro instanceof RespostaRecusada ? erro.message : `falha de rede (${erro?.name || "erro"})`;
    }
    if (tentativa < tentativas) await esperar(intervaloMs);
  }
  return { ok: false, esperados: esperados.size, montados, motivo };
}

async function principal() {
  const [release, pasta] = process.argv.slice(2);
  const resultado = await confirmar({
    url: process.env.SENTRY_URL,
    org: process.env.SENTRY_ORG,
    token: process.env.SENTRY_AUTH_TOKEN,
    release,
    pasta: pasta || "dist/assets",
  });
  if (resultado.ok) {
    console.log(`GlitchTip: o servidor confirmou ${resultado.montados} de ${resultado.esperados} arquivo(s) do release ${release}.`);
    return 0;
  }
  console.log(`AVISO: não deu para confirmar os source maps no GlitchTip (${resultado.motivo}).`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal().then(
    (codigo) => process.exit(codigo),
    (erro) => {
      console.log(`AVISO: a conferência dos source maps quebrou (${erro.message}).`);
      process.exit(1);
    },
  );
}
