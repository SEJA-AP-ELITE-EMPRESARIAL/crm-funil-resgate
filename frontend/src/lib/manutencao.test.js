/**
 * manutencao.test.js — a tela de login reconhece a manutenção do login central (TSK-1240).
 *
 * Roda no `node --test` (npm test), sem navegador.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatarPrevisao, lerManutencao } from "./manutencao.js";

const erroHttp = (status, data) => ({ response: { status, data } });

describe("lerManutencao", () => {
  it("lê o aviso e a previsão do 503 de manutenção", () => {
    const erro = erroHttp(503, {
      erro: "manutencao",
      mensagem: "Troca do servidor do login.",
      previsao: "2026-11-03T19:30:00-03:00",
      detail: "O login está em manutenção. Troca do servidor do login.",
    });
    assert.deepEqual(lerManutencao(erro), {
      mensagem: "Troca do servidor do login.",
      previsao: "2026-11-03T19:30:00-03:00",
    });
  });

  it("aceita a manutenção sem aviso nem previsão", () => {
    const erro = erroHttp(503, { erro: "manutencao", mensagem: "", previsao: null });
    assert.deepEqual(lerManutencao(erro), { mensagem: "", previsao: null });
  });

  it("o 503 de serviço fora do ar não é manutenção", () => {
    assert.equal(lerManutencao(erroHttp(503, { detail: "Tente novamente em instantes." })), null);
  });

  it("senha errada, bloqueio e erro de rede não são manutenção", () => {
    assert.equal(lerManutencao(erroHttp(401, { detail: "x" })), null);
    assert.equal(lerManutencao(erroHttp(429, { erro: "manutencao" })), null);
    assert.equal(lerManutencao(new Error("Network Error")), null);
    assert.equal(lerManutencao(undefined), null);
  });
});

describe("formatarPrevisao", () => {
  it("escreve dia e hora no fuso de quem olha", () => {
    assert.equal(
      formatarPrevisao("2026-11-03T22:30:00+00:00", "America/Sao_Paulo"),
      "3 de novembro, às 19:30",
    );
  });

  it("sem previsão, ou com uma que não é data, não escreve nada", () => {
    assert.equal(formatarPrevisao(null), null);
    assert.equal(formatarPrevisao(""), null);
    assert.equal(formatarPrevisao("amanhã cedo"), null);
  });
});
