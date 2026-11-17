/**
 * telaAtual.test.js — o texto de cada tela no painel do Conecta (TSK-1521).
 *
 * Roda no `node --test` (npm test), sem navegador. Confere a tabela do topo de
 * `telaAtual.js` (rota → módulo · tela), que as telas públicas não têm texto
 * (logo, não mandam sinal) e o estado que a página e as janelas declaram.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
  DETALHES,
  TAMANHO_DA_TELA,
  TAMANHO_DO_MODULO,
  abrirDetalhe,
  assinarTelaDeclarada,
  declararPagina,
  lerTelaDeclarada,
  telaDaRota,
  textoCurto,
} from "./telaAtual.js";

const KANBAN = { aba: "kanban", funil: "Resgate" };
const declarada = (pagina, detalhe = null) => ({ pagina, detalhe });

describe("telaDaRota", () => {
  it("o funil: a aba é o módulo, e o funil, a tela", () => {
    assert.deepEqual(telaDaRota("/", declarada(KANBAN)), {
      modulo: "Kanban",
      tela: "Funil Resgate",
    });
    assert.deepEqual(telaDaRota("/", declarada({ aba: "dashboard", funil: "Base Elite" })), {
      modulo: "Dashboard",
      tela: "Funil Base Elite",
    });
  });

  it("cada janela que conta como tela", () => {
    const casos = {
      cliente: "Funil Resgate · Cliente",
      novoCliente: "Funil Resgate · Novo cliente",
      importacao: "Funil Resgate · Importação de clientes",
      edicaoDoFunil: "Funil Resgate · Edição do funil",
      novoFunil: "Novo funil",
      edicaoDeColuna: "Funil Resgate · Edição de coluna",
      novaColuna: "Funil Resgate · Nova coluna",
    };
    assert.deepEqual(Object.keys(casos).sort(), Object.keys(DETALHES).sort());
    for (const [codigo, tela] of Object.entries(casos)) {
      assert.deepEqual(telaDaRota("/", declarada(KANBAN, codigo)), { modulo: "Kanban", tela }, codigo);
    }
  });

  it("o nome do cliente nunca entra: só o código da janela", () => {
    assert.equal(telaDaRota("/", declarada(KANBAN, "Padaria Pão Quente")).tela, "Funil Resgate");
  });

  it("não repete 'Funil' quando o nome do funil já começa com ele", () => {
    const tela = (funil) => telaDaRota("/", declarada({ aba: "kanban", funil })).tela;
    assert.equal(tela("Funil de Resgate"), "Funil de Resgate");
    assert.equal(tela("funil APN"), "funil APN");
    assert.equal(tela("Funilaria"), "Funil Funilaria");
    assert.equal(tela("Funilária"), "Funil Funilária");
    assert.equal(tela("FUNIL: Resgate"), "FUNIL: Resgate");
  });

  it("sem funil nenhum, e aba desconhecida vira Kanban", () => {
    assert.deepEqual(telaDaRota("/", declarada({ aba: "kanban", funil: "" })), {
      modulo: "Kanban",
      tela: "Sem funil",
    });
    assert.equal(telaDaRota("/", declarada({ aba: "outra", funil: "Resgate" })).modulo, "Kanban");
  });

  it("a troca de senha", () => {
    assert.deepEqual(telaDaRota("/trocar-senha", declarada(null)), {
      modulo: "Conta",
      tela: "Troca de senha",
    });
    assert.deepEqual(
      telaDaRota("/trocar-senha/", declarada(null), { precisa_trocar_senha: true }),
      { modulo: "Conta", tela: "Troca de senha obrigatória" },
    );
  });

  it("telas públicas, o /admin do Django e rota desconhecida não têm tela: nada de sinal", () => {
    for (const rota of [
      "/login",
      "/esqueci-senha",
      "/definir-senha",
      "/admin",
      "/admin/",
      "/admin/crm/apikey/",
      "/qualquer",
      "",
      undefined,
    ]) {
      assert.equal(telaDaRota(rota, declarada(KANBAN, "cliente")), null, String(rota));
    }
  });

  it("o funil ainda carregando (nada declarado) não tem tela", () => {
    assert.equal(telaDaRota("/", declarada(null)), null);
    assert.equal(telaDaRota("/", declarada(null, "cliente")), null);
    assert.equal(telaDaRota("/", null), null);
  });

  it("textos curtos: o que o Conecta grava (60 e 120)", () => {
    const longo = "x".repeat(200);
    const { modulo, tela } = telaDaRota("/", declarada({ aba: "kanban", funil: longo }, "importacao"));
    assert.ok(modulo.length <= TAMANHO_DO_MODULO);
    assert.ok(tela.length <= TAMANHO_DA_TELA);
    // O funil é cortado antes, e a janela não se perde.
    assert.ok(tela.endsWith(" · Importação de clientes"), tela);
  });
});

describe("textoCurto", () => {
  it("uma linha só, sem espaço sobrando, cortada com reticências", () => {
    assert.equal(textoCurto("  Base \n  Elite\t", 120), "Base Elite");
    assert.equal(textoCurto("abcdef", 4), "abc…");
    assert.equal(textoCurto("abcd", 4), "abcd");
    assert.equal(textoCurto(null, 10), "");
    assert.equal(textoCurto(42, 10), "");
  });
});

describe("a tela declarada", () => {
  const retirar = [];
  afterEach(() => {
    while (retirar.length) retirar.pop()();
  });

  it("a página declara a aba e o funil, e retira ao sair", () => {
    retirar.push(declararPagina(KANBAN));
    assert.deepEqual(lerTelaDeclarada(), { pagina: KANBAN, detalhe: null });

    retirar.pop()();
    assert.deepEqual(lerTelaDeclarada(), { pagina: null, detalhe: null });
  });

  it("vale a janela aberta por último; ao fechar, volta a de baixo", () => {
    retirar.push(declararPagina(KANBAN));
    const fecharCliente = abrirDetalhe("cliente");
    const fecharColuna = abrirDetalhe("novaColuna");
    assert.equal(lerTelaDeclarada().detalhe, "novaColuna");

    fecharColuna();
    assert.equal(lerTelaDeclarada().detalhe, "cliente");
    fecharCliente();
    assert.equal(lerTelaDeclarada().detalhe, null);
    // Fechar duas vezes não estraga nada.
    fecharCliente();
    assert.equal(lerTelaDeclarada().detalhe, null);
  });

  it("a retirada de uma página antiga não apaga a nova", () => {
    const antiga = declararPagina(KANBAN);
    retirar.push(declararPagina({ aba: "dashboard", funil: "Resgate" }));
    antiga();
    assert.equal(lerTelaDeclarada().pagina.aba, "dashboard");
  });

  it("o mesmo objeto enquanto nada muda, e aviso a cada mudança", () => {
    const ouvinte = mock.fn();
    const sair = assinarTelaDeclarada(ouvinte);
    try {
      const antes = lerTelaDeclarada();
      assert.equal(lerTelaDeclarada(), antes);

      retirar.push(declararPagina(KANBAN));
      assert.notEqual(lerTelaDeclarada(), antes);
      assert.equal(ouvinte.mock.callCount(), 1);

      const fechar = abrirDetalhe("cliente");
      fechar();
      assert.equal(ouvinte.mock.callCount(), 3);
    } finally {
      sair();
    }
    retirar.push(declararPagina(KANBAN));
    assert.equal(ouvinte.mock.callCount(), 3);
  });
});
