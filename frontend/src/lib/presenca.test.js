/**
 * presenca.test.js — o sinal de presença da tela (TSK-1521), com o relógio na mão.
 *
 * Roda no `node --test` (npm test), sem navegador: o relógio é o `mock.timers`
 * do Node (setTimeout e Date), o `document` e a `window` são `EventTarget`s, e
 * o `api.post` é simulado.
 *
 * O que o painel do Conecta precisa (regras de 16/11/2026): um sinal por minuto
 * com a aba aberta, também em segundo plano; na troca de tela, um na hora (e um
 * só quando a troca vem com redirecionamento); na volta à aba, um na hora; e a
 * última interação de verdade, porque "parado" é mais de 3 minutos sem clique
 * nem tecla. Sem login, nada. Erro do sinal não aparece nem trava o próximo, e
 * um 401 dele não tira ninguém do sistema: só renova o access de quem está
 * mexendo na tela, uma vez, e em silêncio.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import axios from "axios";
// O `settle` de verdade, o que os adaptadores do axios (xhr, fetch) chamam para
// decidir entre o caminho de sucesso e o de erro. Interno, só para o teste.
import settle from "axios/unsafe/core/settle.js";

import {
  ATIVA_HA_MENOS_DE_MS,
  ESPERA_NA_TROCA_DE_TELA_MS,
  INTERACOES,
  INTERVALO_DO_SINAL_MS,
  ROTA_DA_PRESENCA,
  TEMPO_MAXIMO_DO_PEDIDO_MS,
  VOLTA_SEM_SINAL_MS,
  criarEnvioDePresenca,
  criarSinalDePresenca,
} from "./presenca.js";

const INICIO = Date.parse("2026-11-17T13:00:00.000Z");
const FUNIL = { modulo: "Kanban", tela: "Funil Resgate" };
const DASHBOARD = { modulo: "Dashboard", tela: "Funil Resgate" };
const CLIENTE = { modulo: "Kanban", tela: "Funil Resgate · Cliente" };

// === O relógio =============================================================

function documentoFalso() {
  const documento = new EventTarget();
  documento.visibilityState = "visible";
  return documento;
}

describe("criarSinalDePresenca", () => {
  let documento;
  let janela;
  let enviar;
  let relogio;

  // De 1 em 1 ms: num `tick` grande, o relógio falso do Node pula direto para o
  // fim, e o timer que um timer agenda (o minuto seguinte) não dispara.
  const passar = (ms) => {
    for (let i = 0; i < ms; i += 1) mock.timers.tick(1);
  };
  const sinais = () => enviar.mock.calls.map((chamada) => chamada.arguments[0]);
  const interagir = (evento, alvo = documento) => alvo.dispatchEvent(new Event(evento));
  function mudarVisibilidade(estado) {
    documento.visibilityState = estado;
    documento.dispatchEvent(new Event("visibilitychange"));
  }

  beforeEach(() => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: INICIO });
    documento = documentoFalso();
    janela = new EventTarget();
    enviar = mock.fn(async () => true);
    relogio = criarSinalDePresenca({ enviar, documento, janela });
  });

  afterEach(() => {
    relogio.destruir();
    mock.timers.reset();
  });

  it("logado, manda depois da espera curta e depois um por minuto, com a tela e a última interação", () => {
    relogio.definirTela(FUNIL);

    passar(ESPERA_NA_TROCA_DE_TELA_MS - 1);
    assert.equal(sinais().length, 0);
    passar(1);
    // Abrir o CRM é a primeira interação.
    assert.deepEqual(sinais(), [{ ...FUNIL, ultimaInteracao: INICIO }]);

    passar(INTERVALO_DO_SINAL_MS - 1);
    assert.equal(sinais().length, 1);
    passar(1);
    assert.equal(sinais().length, 2);
    passar(INTERVALO_DO_SINAL_MS * 3);
    assert.equal(sinais().length, 5);
    // O sinal do minuto não conta como interação.
    assert.ok(sinais().every((s) => s.ultimaInteracao === INICIO));
  });

  it("sem login (sem tela) não manda nada, nem com o tempo nem na volta à aba", () => {
    relogio.definirTela(null);
    passar(INTERVALO_DO_SINAL_MS * 5);
    mudarVisibilidade("hidden");
    passar(VOLTA_SEM_SINAL_MS * 2);
    mudarVisibilidade("visible");
    interagir("pointerdown");
    passar(INTERVALO_DO_SINAL_MS * 2);

    assert.equal(sinais().length, 0);
  });

  it("tela sem texto também não manda", () => {
    relogio.definirTela({ modulo: "Kanban", tela: "" });
    passar(INTERVALO_DO_SINAL_MS * 2);

    assert.equal(sinais().length, 0);
  });

  it("segue mandando com a aba em segundo plano", () => {
    relogio.definirTela(FUNIL);
    mudarVisibilidade("hidden");

    passar(ESPERA_NA_TROCA_DE_TELA_MS + INTERVALO_DO_SINAL_MS * 2);

    assert.equal(sinais().length, 3);
  });

  it("na troca de tela manda na hora e o minuto recomeça dali", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    passar(40 * 1000);
    assert.equal(sinais().length, 1);

    relogio.definirTela(DASHBOARD);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    assert.deepEqual(
      sinais().map((s) => s.modulo),
      ["Kanban", "Dashboard"],
    );

    // O sinal que viria aos 60 s da primeira tela não sai: o minuto recomeçou.
    passar(INTERVALO_DO_SINAL_MS - 1);
    assert.equal(sinais().length, 2);
    passar(1);
    assert.equal(sinais().length, 3);
    assert.equal(sinais()[2].modulo, "Dashboard");
  });

  it("um redirecionamento gera um sinal só, com a tela onde a pessoa ficou", () => {
    // A rota desconhecida (sem tela) que o App.jsx leva ao funil, que termina
    // de carregar e abre o cartão: tudo dentro da espera.
    relogio.definirTela(null);
    passar(100);
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS - 100);
    relogio.definirTela(CLIENTE);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    passar(5 * 1000);

    assert.deepEqual(
      sinais().map((s) => s.tela),
      ["Funil Resgate · Cliente"],
    );
  });

  it("a mesma tela de novo não manda outro sinal", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    relogio.definirTela({ ...FUNIL });
    passar(ESPERA_NA_TROCA_DE_TELA_MS * 4);

    assert.equal(sinais().length, 1);
  });

  it("ao sair (logout), para tudo, também na volta à aba", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    assert.equal(sinais().length, 1);

    relogio.definirTela(null);
    passar(INTERVALO_DO_SINAL_MS * 3);
    mudarVisibilidade("hidden");
    passar(VOLTA_SEM_SINAL_MS);
    mudarVisibilidade("visible");
    passar(INTERVALO_DO_SINAL_MS);

    assert.equal(sinais().length, 1);
  });

  it("sair antes da espera acabar não manda o sinal que estava para sair", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS - 1);
    relogio.definirTela(null);
    passar(INTERVALO_DO_SINAL_MS);

    assert.equal(sinais().length, 0);
  });

  it("ao voltar à aba, manda na hora e o minuto recomeça dali", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    passar(20 * 1000);
    mudarVisibilidade("hidden");
    passar(VOLTA_SEM_SINAL_MS - 20 * 1000);
    assert.equal(sinais().length, 1);

    mudarVisibilidade("visible");
    assert.equal(sinais().length, 2);

    // O sinal que viria aos 60 s da abertura não sai: o minuto recomeçou na volta.
    passar(INTERVALO_DO_SINAL_MS - 1);
    assert.equal(sinais().length, 2);
    passar(1);
    assert.equal(sinais().length, 3);
  });

  it("voltar à aba logo depois de um sinal não manda outro", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    for (let i = 0; i < 5; i += 1) {
      mudarVisibilidade("hidden");
      passar(3 * 1000);
      mudarVisibilidade("visible");
    }

    assert.equal(sinais().length, 1);
  });

  it("a última interação é a do clique, da tecla, da roda, do toque e do Voltar do navegador", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);

    const casos = [
      ["pointerdown", documento],
      ["keydown", documento],
      ["wheel", documento],
      ["touchmove", documento],
      // Voltar/Avançar: nenhum clique na página, só o `popstate`.
      ["popstate", janela],
    ];
    for (const [evento, alvo] of casos) {
      passar(7 * 1000);
      const quando = Date.now();
      interagir(evento, alvo);
      passar(INTERVALO_DO_SINAL_MS - 7 * 1000);
      assert.equal(sinais().at(-1).ultimaInteracao, quando, evento);
    }

    // Parada: os minutos seguintes repetem a mesma interação, e o Conecta vê o "parado".
    const ultima = sinais().at(-1).ultimaInteracao;
    passar(INTERVALO_DO_SINAL_MS * 4);
    assert.ok(sinais().slice(-4).every((s) => s.ultimaInteracao === ultima));
  });

  it("a rolagem feita pela própria página (o evento scroll) não é interação", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS + 10 * 1000);
    interagir("scroll");
    interagir("mousemove");
    passar(INTERVALO_DO_SINAL_MS);

    assert.equal(sinais().at(-1).ultimaInteracao, INICIO);
  });

  it("a troca de tela leva a interação que a causou", () => {
    relogio.definirTela(FUNIL);
    passar(ESPERA_NA_TROCA_DE_TELA_MS + 30 * 1000);
    const clique = Date.now();
    interagir("pointerdown");
    relogio.definirTela(CLIENTE);
    passar(ESPERA_NA_TROCA_DE_TELA_MS);

    assert.deepEqual(sinais().at(-1), { ...CLIENTE, ultimaInteracao: clique });
  });

  it("erro do envio (rejeição ou exceção) não sobe nem para o relógio", async () => {
    const falhas = [
      () => Promise.reject(new Error("rede caiu")),
      () => {
        throw new Error("bug");
      },
    ];
    enviar.mock.mockImplementation(() => falhas[enviar.mock.callCount() % 2]());
    relogio.definirTela(FUNIL);

    passar(ESPERA_NA_TROCA_DE_TELA_MS);
    passar(INTERVALO_DO_SINAL_MS * 3);
    // As rejeições já tratadas não viram `unhandledRejection`.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(sinais().length, 4);
  });

  it("destruir solta os ouvintes e o relógio", () => {
    relogio.definirTela(FUNIL);
    relogio.destruir();
    passar(INTERVALO_DO_SINAL_MS * 3);
    mudarVisibilidade("hidden");
    passar(VOLTA_SEM_SINAL_MS);
    mudarVisibilidade("visible");

    assert.equal(sinais().length, 0);
  });

  it("destruir tira cada ouvinte que pôs, no documento e na janela", () => {
    // O `tela = null` do destruir já calaria o sinal: aqui se conta o que ficou
    // pendurado. Com a regra do `EventTarget`: só sai o ouvinte do mesmo tipo,
    // com a mesma função e a mesma `capture` com que entrou.
    const captura = (opcoes) => (typeof opcoes === "boolean" ? opcoes : Boolean(opcoes?.capture));
    const vigiar = (alvo) => {
      const vivos = [];
      const mesmo = (tipo, fn, opcoes) => (v) =>
        v.tipo === tipo && v.fn === fn && v.captura === captura(opcoes);
      alvo.addEventListener = (tipo, fn, opcoes) => {
        if (!vivos.some(mesmo(tipo, fn, opcoes))) vivos.push({ tipo, fn, captura: captura(opcoes) });
      };
      alvo.removeEventListener = (tipo, fn, opcoes) => {
        const posicao = vivos.findIndex(mesmo(tipo, fn, opcoes));
        if (posicao >= 0) vivos.splice(posicao, 1);
      };
      return vivos;
    };
    const outroDocumento = documentoFalso();
    const outraJanela = new EventTarget();
    const noDocumento = vigiar(outroDocumento);
    const naJanela = vigiar(outraJanela);

    const outro = criarSinalDePresenca({ enviar, documento: outroDocumento, janela: outraJanela });
    assert.deepEqual(
      noDocumento.map((v) => v.tipo).sort(),
      [...INTERACOES, "visibilitychange"].sort(),
    );
    assert.deepEqual(
      naJanela.map((v) => v.tipo),
      ["popstate"],
    );
    outro.destruir();

    assert.deepEqual([...noDocumento, ...naJanela], []);
  });
});

// === O pedido ==============================================================

describe("criarEnvioDePresenca", () => {
  const SINAL = { ...FUNIL, ultimaInteracao: INICIO };

  function montar(opcoes = {}) {
    const { status = 204 } = opcoes;
    const estado = { token: "token" in opcoes ? opcoes.token : "token-de-acesso" };
    const post = mock.fn(async () => ({ status }));
    const enviar = criarEnvioDePresenca({ post, tokenAtual: () => estado.token });
    return { estado, post, enviar };
  }

  it("manda a tela e a última interação em ISO 8601, com o fuso", async () => {
    const { post, enviar } = montar();

    assert.equal(await enviar(SINAL), true);

    assert.equal(post.mock.callCount(), 1);
    const [url, corpo, opcoes] = post.mock.calls[0].arguments;
    assert.equal(url, ROTA_DA_PRESENCA);
    assert.equal(url, "/api/crm/presenca/");
    assert.deepEqual(corpo, {
      modulo: "Kanban",
      tela: "Funil Resgate",
      ultima_interacao: new Date(INICIO).toISOString(),
    });
    assert.equal(corpo.ultima_interacao, "2026-11-17T13:00:00.000Z");
    assert.equal(opcoes.timeout, TEMPO_MAXIMO_DO_PEDIDO_MS);
  });

  it("toda resposta HTTP volta como sucesso para o axios: o 401 não chega ao interceptor", async () => {
    const { post, enviar } = montar();
    await enviar(SINAL);
    const { validateStatus } = post.mock.calls[0].arguments[2];

    for (const status of [204, 400, 401, 403, 429, 500, 503]) {
      assert.equal(validateStatus(status), true, String(status));
    }
  });

  it("sem login (sem token) não manda nada", async () => {
    for (const token of [null, undefined, ""]) {
      const { post, enviar } = montar({ token });
      assert.equal(await enviar(SINAL), false);
      assert.equal(post.mock.callCount(), 0);
    }
  });

  it("sem tela não manda nada", async () => {
    const { post, enviar } = montar();
    assert.equal(await enviar({ modulo: "Kanban", tela: "" }), false);
    assert.equal(await enviar({ modulo: "Kanban" }), false);
    assert.equal(post.mock.callCount(), 0);
  });

  it("true só no 204; o resto vira false, sem lançar", async () => {
    for (const status of [200, 400, 403, 429, 500, 503]) {
      const { enviar } = montar({ status });
      assert.equal(await enviar(SINAL), false, String(status));
    }
  });

  it("falha de rede ou tempo esgotado viram false, sem lançar nem repetir", async () => {
    const { post, enviar } = montar();
    post.mock.mockImplementation(async () => {
      throw Object.assign(new Error("timeout of 15000ms exceeded"), { code: "ECONNABORTED" });
    });

    assert.equal(await enviar(SINAL), false);
    assert.equal(post.mock.callCount(), 1);
  });

  it("sem última interação válida, o sinal vai sem ela", async () => {
    for (const ultimaInteracao of [null, undefined, Number.NaN, 8.64e15 + 1, "ontem"]) {
      const { post, enviar } = montar();
      assert.equal(await enviar({ ...FUNIL, ultimaInteracao }), true);
      assert.equal("ultima_interacao" in post.mock.calls[0].arguments[1], false);
    }
  });

  it("o access recusado (401) não é mandado de novo; o token novo volta a mandar", async () => {
    const { estado, post, enviar } = montar({ status: 401 });

    assert.equal(await enviar(SINAL), false);
    assert.equal(await enviar(SINAL), false);
    assert.equal(await enviar(SINAL), false);
    assert.equal(post.mock.callCount(), 1);

    // Uma ação da pessoa renovou a sessão (ou ela entrou de novo).
    estado.token = "token-novo";
    post.mock.mockImplementation(async () => ({ status: 204 }));
    assert.equal(await enviar(SINAL), true);
    assert.equal(post.mock.callCount(), 2);
  });

  describe("o access vencido de quem está mexendo na tela", () => {
    // Quem mexeu agora há pouco, e quem está parado há mais de 3 min.
    const ATIVA = () => ({ ...FUNIL, ultimaInteracao: Date.now() - 10 * 1000 });
    const PARADA = () => ({ ...FUNIL, ultimaInteracao: Date.now() - ATIVA_HA_MENOS_DE_MS - 1000 });

    /** O backend recusa o "token-velho" e aceita os outros; `renovar` troca o token. */
    function montarComRenovacao({ renova = true } = {}) {
      const estado = { token: "token-velho", renovacoes: 0 };
      const usados = [];
      const post = mock.fn(async () => {
        usados.push(estado.token);
        return { status: estado.token === "token-velho" ? 401 : 204 };
      });
      const renovar = mock.fn(async () => {
        estado.renovacoes += 1;
        if (renova === "erro") throw new Error("refresh recusado");
        if (renova) estado.token = `token-novo-${estado.renovacoes}`;
      });
      const enviar = criarEnvioDePresenca({ post, tokenAtual: () => estado.token, renovar });
      return { estado, post, renovar, usados, enviar };
    }

    it("no 401, renova uma vez e manda de novo com o access novo", async () => {
      const { post, renovar, usados, enviar } = montarComRenovacao();

      assert.equal(await enviar(ATIVA()), true);

      assert.equal(renovar.mock.callCount(), 1);
      assert.deepEqual(usados, ["token-velho", "token-novo-1"]);
      // O mesmo corpo nas duas vezes.
      assert.deepEqual(post.mock.calls[0].arguments[1], post.mock.calls[1].arguments[1]);
    });

    it("parada, não renova: o sinal se cala; volta quando ela mexe", async () => {
      const { post, renovar, enviar } = montarComRenovacao();

      assert.equal(await enviar(PARADA()), false);
      assert.equal(await enviar(PARADA()), false);
      assert.equal(renovar.mock.callCount(), 0);
      assert.equal(post.mock.callCount(), 1);

      // Mexeu: o sinal seguinte renova sem mandar antes o token já recusado.
      assert.equal(await enviar(ATIVA()), true);
      assert.equal(renovar.mock.callCount(), 1);
      assert.equal(post.mock.callCount(), 2);
    });

    it("sem a última interação, também não renova", async () => {
      const { renovar, enviar } = montarComRenovacao();
      assert.equal(await enviar({ ...FUNIL, ultimaInteracao: null }), false);
      assert.equal(renovar.mock.callCount(), 0);
    });

    // Que a falha não tira ninguém do sistema é do `api.js` (sem `clearTokens`
    // nem evento): quem prova é o e2e "a renovação recusada...".
    it("a renovação que falha não é tentada de novo, nem o token recusado é mandado", async () => {
      const { estado, post, renovar, enviar } = montarComRenovacao({ renova: "erro" });

      assert.equal(await enviar(ATIVA()), false);
      assert.equal(await enviar(ATIVA()), false);
      assert.equal(await enviar(ATIVA()), false);
      assert.equal(renovar.mock.callCount(), 1);
      assert.equal(post.mock.callCount(), 1);

      // Uma ação da pessoa renovou a sessão por fora: o sinal volta.
      estado.token = "token-da-tela";
      assert.equal(await enviar(ATIVA()), true);
    });

    it("a renovação que não troca o token não manda de novo", async () => {
      const { post, renovar, enviar } = montarComRenovacao({ renova: false });

      assert.equal(await enviar(ATIVA()), false);
      assert.equal(await enviar(ATIVA()), false);
      assert.equal(renovar.mock.callCount(), 1);
      assert.equal(post.mock.callCount(), 1);
    });

    it("o access novo também recusado: sem segunda renovação, e o sinal se cala", async () => {
      const { estado, post, renovar, enviar } = montarComRenovacao();
      post.mock.mockImplementation(async () => ({ status: 401 }));

      assert.equal(await enviar(ATIVA()), false);
      assert.equal(await enviar(ATIVA()), false);
      assert.equal(await enviar(ATIVA()), false);
      assert.equal(renovar.mock.callCount(), 1);
      assert.equal(post.mock.callCount(), 2);
      assert.equal(estado.token, "token-novo-1");
    });

    it("depois de um sinal aceito, o próximo vencimento renova de novo", async () => {
      const { estado, renovar, enviar } = montarComRenovacao();

      assert.equal(await enviar(ATIVA()), true);
      assert.equal(await enviar(ATIVA()), true);
      // Mais 4 h: o access novo venceu também.
      estado.token = "token-velho";
      assert.equal(await enviar(ATIVA()), true);
      assert.equal(renovar.mock.callCount(), 2);
    });

    it("dois sinais recusados ao mesmo tempo renovam uma vez só", async () => {
      // A troca de tela com o sinal do minuto ainda no caminho.
      const { estado, post, renovar, enviar } = montarComRenovacao();
      const pendentes = [];
      post.mock.mockImplementation(
        () =>
          new Promise((resolve) => {
            const token = estado.token;
            pendentes.push(() => resolve({ status: token === "token-velho" ? 401 : 204 }));
          }),
      );

      const primeiro = enviar(ATIVA());
      const segundo = enviar(ATIVA());
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(pendentes.length, 2);
      pendentes.splice(0).forEach((responder) => responder());
      // O sinal que renovou manda de novo com o access novo.
      await new Promise((resolve) => setImmediate(resolve));
      pendentes.splice(0).forEach((responder) => responder());

      assert.deepEqual((await Promise.all([primeiro, segundo])).sort(), [false, true]);
      assert.equal(renovar.mock.callCount(), 1);
      assert.equal(post.mock.callCount(), 3);
    });

    it("sem `renovar`, o 401 só cala o token", async () => {
      const post = mock.fn(async () => ({ status: 401 }));
      const enviar = criarEnvioDePresenca({ post, tokenAtual: () => "token-velho" });

      assert.equal(await enviar(ATIVA()), false);
      assert.equal(await enviar(ATIVA()), false);
      assert.equal(post.mock.callCount(), 1);
    });
  });

  it("o 401 do token velho que chega depois da renovação não cala o novo", async () => {
    const { estado, post, enviar } = montar();
    let responder;
    post.mock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          responder = resolve;
        }),
    );

    const pendente = enviar(SINAL);
    estado.token = "token-novo";
    responder({ status: 401 });
    assert.equal(await pendente, false);

    assert.equal(await enviar(SINAL), true);
    assert.equal(post.mock.callCount(), 2);
  });
});

describe("o sinal com o axios de verdade", () => {
  // O interceptor de resposta do `api.js` renova o token no 401 e, se não
  // der, limpa a sessão e leva ao login. Aqui, um axios com um interceptor que
  // só conta por onde a resposta passou, e um adaptador no lugar da rede.
  function axiosQueResponde(status) {
    const caminhos = { sucesso: 0, erro: 0 };
    const instancia = axios.create({
      adapter: (config) =>
        new Promise((resolve, reject) => {
          settle(resolve, reject, { status, statusText: "", headers: {}, data: "", config });
        }),
    });
    instancia.interceptors.response.use(
      (resposta) => {
        caminhos.sucesso += 1;
        return resposta;
      },
      (erro) => {
        caminhos.erro += 1;
        return Promise.reject(erro);
      },
    );
    return { instancia, caminhos };
  }

  for (const status of [401, 403, 500]) {
    it(`o ${status} do sinal passa longe do caminho de erro do interceptor (sem sair)`, async () => {
      const { instancia, caminhos } = axiosQueResponde(status);
      const enviar = criarEnvioDePresenca({
        post: (...args) => instancia.post(...args),
        tokenAtual: () => "token-de-acesso",
      });

      assert.equal(await enviar({ ...FUNIL, ultimaInteracao: INICIO }), false);
      assert.deepEqual(caminhos, { sucesso: 1, erro: 0 });
    });
  }

  it("sem o `validateStatus` do sinal, o mesmo 401 iria ao caminho de erro", async () => {
    // A prova de que o teste acima mede alguma coisa.
    const { instancia, caminhos } = axiosQueResponde(401);
    await assert.rejects(instancia.post(ROTA_DA_PRESENCA, {}));
    assert.deepEqual(caminhos, { sucesso: 0, erro: 1 });
  });
});
