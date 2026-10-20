/**
 * confirmar-sourcemaps.test.mjs — o "enviados" do build só vem com o servidor confirmando (TSK-1147).
 *
 * No Conecta (TSK-1136), o primeiro deploy imprimiu "enviados" porque o CLI saiu
 * com 0, e o GlitchTip recusou cada pacote depois. `confirmar-sourcemaps.mjs` só
 * dá certo quando a API de arquivos do release mostra cada debug ID dos .js.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import { confirmar, debugIdsInjetados, debugIdsNoServidor } from "./confirmar-sourcemaps.mjs";

const ID_A = "c7f9a1e1-7498-5090-bd83-882c0233d9b0";
const ID_B = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const BASE = { url: "https://erros.exemplo/", org: "seja-ap", token: "tok-teste", release: "abc 123" };

function resposta(arquivos, { status = 200, link = "" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nome) => (nome.toLowerCase() === "link" ? link : null) },
    json: async () => arquivos,
  };
}

const arquivo = (id) => ({ name: "index.js", headers: { "debug-id": id, sourcemap: "index.js.map" } });

/** Um `fetch` falso que devolve, em ordem, cada item da lista (o último se repete). */
function fetchEmSequencia(...respostas) {
  let chamada = 0;
  return mock.fn(async () => {
    const proxima = respostas[Math.min(chamada, respostas.length - 1)];
    chamada += 1;
    if (proxima instanceof Error) throw proxima;
    return proxima;
  });
}

let pasta;

beforeEach(async () => {
  pasta = await mkdtemp(path.join(tmpdir(), "confirmar-sourcemaps-"));
  await mkdir(path.join(pasta, "sub"));
  await writeFile(path.join(pasta, "index.js"), `console.log(1);\n//# debugId=${ID_A}\n`);
  await writeFile(path.join(pasta, "sub", "chunk.js"), `console.log(2);\n//# debugId=${ID_B.toUpperCase()}`);
  await writeFile(path.join(pasta, "sem-mapa.js"), "console.log(3);\n");
  await writeFile(path.join(pasta, "index.js.map"), `{"debugId":"${ID_A}"}`);
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

describe("debugIdsInjetados", () => {
  it("lê o comentário do inject em cada .js, também nas subpastas, e ignora o .map", async () => {
    assert.deepEqual(await debugIdsInjetados(pasta), new Set([ID_A, ID_B]));
  });
});

describe("debugIdsNoServidor", () => {
  it("pede a lista do release com o token e segue o Link do GlitchTip (repr de set)", async () => {
    const segunda = "https://erros.exemplo/api/0/organizations/seja-ap/releases/abc%20123/files/?cursor=x";
    const fetch = fetchEmSequencia(
      resposta([arquivo(ID_A)], {
        link: `{'<https://erros.exemplo/a>; rel="previous"; results="false", <${segunda}>; rel="next"; results="true"; cursor="x"'}`,
      }),
      resposta([arquivo(ID_B.toUpperCase()), { name: "x.js", headers: {} }], {
        link: `<${segunda}>; rel="next"; results="false"`,
      }),
    );

    const ids = await debugIdsNoServidor({ ...BASE, fetch });

    assert.deepEqual(ids, new Set([ID_A, ID_B]));
    assert.equal(fetch.mock.callCount(), 2);
    const [primeira, opcoes] = fetch.mock.calls[0].arguments;
    assert.equal(primeira, "https://erros.exemplo/api/0/organizations/seja-ap/releases/abc%20123/files/?limit=100");
    assert.equal(opcoes.headers.Authorization, "Bearer tok-teste");
    assert.ok(opcoes.signal instanceof AbortSignal);
    assert.equal(fetch.mock.calls[1].arguments[0], segunda);
  });

  it("só conta o .js que veio com o mapa ligado", async () => {
    const fetch = fetchEmSequencia(resposta([arquivo(ID_A), { name: "chunk.js", headers: { "debug-id": ID_B } }]));
    assert.deepEqual(await debugIdsNoServidor({ ...BASE, fetch }), new Set([ID_A]));
  });

  it("servidor que não responde estoura o prazo do pedido", async () => {
    const fetch = mock.fn(
      (_url, { signal }) =>
        new Promise((_resolve, rejeitar) => signal.addEventListener("abort", () => rejeitar(signal.reason))),
    );
    await assert.rejects(debugIdsNoServidor({ ...BASE, fetch, prazoMs: 20 }));
  });

  it("resposta de erro vira exceção com o status", async () => {
    const fetch = fetchEmSequencia(resposta({ detail: "x" }, { status: 403 }));
    await assert.rejects(debugIdsNoServidor({ ...BASE, fetch }), /403/);
  });
});

describe("confirmar", () => {
  it("confirma quando o servidor mostra todos os debug IDs", async () => {
    const fetch = fetchEmSequencia(resposta([arquivo(ID_A), arquivo(ID_B)]));
    const esperar = mock.fn();

    const resultado = await confirmar({ ...BASE, pasta, fetch, esperar });

    assert.deepEqual(resultado, { ok: true, esperados: 2, montados: 2, motivo: "" });
    assert.equal(esperar.mock.callCount(), 0);
  });

  it("espera a montagem assíncrona: confirma quando o que faltava aparece", async () => {
    const fetch = fetchEmSequencia(
      resposta([]),
      new Error("rede caiu"),
      resposta([arquivo(ID_A)]),
      resposta([arquivo(ID_A), arquivo(ID_B)]),
    );
    const esperar = mock.fn();

    const resultado = await confirmar({ ...BASE, pasta, fetch, esperar, tentativas: 5, intervaloMs: 7 });

    assert.equal(resultado.ok, true);
    assert.equal(esperar.mock.callCount(), 3);
    assert.deepEqual(esperar.mock.calls[0].arguments, [7]);
  });

  it("não confirma se faltar um arquivo até a última tentativa (a recusa do servidor)", async () => {
    const fetch = fetchEmSequencia(resposta([arquivo(ID_A)]));
    const esperar = mock.fn();

    const resultado = await confirmar({ ...BASE, pasta, fetch, esperar, tentativas: 3 });

    assert.deepEqual(resultado, { ok: false, esperados: 2, montados: 1, motivo: "o servidor mostra 1 de 2" });
    assert.equal(fetch.mock.callCount(), 3);
    assert.equal(esperar.mock.callCount(), 2);
  });

  it("um release de outro build com os mesmos números não confirma: conta por debug ID", async () => {
    const fetch = fetchEmSequencia(resposta([arquivo("1".repeat(32)), arquivo("2".repeat(32))]));

    const resultado = await confirmar({ ...BASE, pasta, fetch, esperar: mock.fn(), tentativas: 1 });

    assert.equal(resultado.ok, false);
    assert.equal(resultado.montados, 0);
  });

  it("de erro de rede só sai o nome: a mensagem pode repetir o token", async () => {
    const fetch = fetchEmSequencia(new TypeError('"Bearer tok-teste " is an invalid header value.'));

    const resultado = await confirmar({ ...BASE, pasta, fetch, esperar: mock.fn(), tentativas: 1 });

    assert.equal(resultado.motivo, "falha de rede (TypeError)");
  });

  it("erro da API até o fim vira o motivo", async () => {
    const fetch = fetchEmSequencia(resposta({}, { status: 401 }));

    const resultado = await confirmar({ ...BASE, pasta, fetch, esperar: mock.fn(), tentativas: 2 });

    assert.equal(resultado.ok, false);
    assert.match(resultado.motivo, /401/);
  });

  it("sem nenhum debug ID injetado não pergunta nada e não confirma", async () => {
    const vazia = await mkdtemp(path.join(tmpdir(), "confirmar-vazia-"));
    await writeFile(path.join(vazia, "index.js"), "console.log(1);\n");
    const fetch = mock.fn();

    const resultado = await confirmar({ ...BASE, pasta: vazia, fetch, esperar: mock.fn() });

    assert.equal(resultado.ok, false);
    assert.equal(fetch.mock.callCount(), 0);
    await rm(vazia, { recursive: true, force: true });
  });

  for (const campo of ["url", "org", "token", "release"]) {
    it(`sem ${campo} não pergunta nada e não confirma`, async () => {
      const fetch = mock.fn();

      const resultado = await confirmar({ ...BASE, [campo]: "", pasta, fetch, esperar: mock.fn() });

      assert.equal(resultado.ok, false);
      assert.equal(fetch.mock.callCount(), 0);
    });
  }
});
