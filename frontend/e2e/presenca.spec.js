/**
 * Ponta a ponta do sinal de presença (TSK-1521): a tela de verdade no Chromium,
 * o backend local e o Conecta falso (`apoio/conecta_falso.py`). Rodar com
 * `e2e/rodar-presenca.sh`, que sobe os três.
 *
 * O passo 3 do "Como confirmo" depende do Conecta em produção; aqui, contra o
 * falso:
 * - logado, a pessoa aparece no sistema CRM com a tela certa em até 15 s, e de
 *   novo a cada troca de tela (o redirecionamento gera um sinal só);
 * - um sinal por minuto com a aba aberta;
 * - na tela de login, sem login, nenhum pedido de sinal sai do navegador;
 * - o /admin do Django não manda sinal, e a sessão dele é recusada na rota;
 * - o erro do sinal (401, 500, rede) não aparece e não tira ninguém do
 *   sistema; o 401 renova a sessão uma vez só, e só de quem está mexendo na
 *   tela (o access vencido de quem só lê o CRM).
 *
 * Os prints vão para docs/telas/tsk-1521/.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const CONECTA = process.env.E2E_CONECTA;
const BACKEND = process.env.E2E_BACKEND;
const PRINTS = fileURLToPath(new URL("../../docs/telas/tsk-1521/", import.meta.url));
const ROTA = "/api/crm/presenca/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const RAIZ = /:\d+\/$/;
const PRIMEIRO_FUNIL = "Funil Indicados APN";

mkdirSync(PRINTS, { recursive: true });

async function sinais(request) {
  return (await request.get(`${CONECTA}/_sinais`)).json();
}

async function limparSinais(request) {
  await request.post(`${CONECTA}/_sinais/limpar`);
}

/** Espera o Conecta falso receber um sinal com estes campos; devolve o sinal. */
async function esperarSinal(request, campos, { prazo = 15 * 1000 } = {}) {
  let achado;
  await expect
    .poll(
      async () => {
        achado = (await sinais(request)).find((s) =>
          Object.entries(campos).every(([chave, valor]) => s.corpo[chave] === valor),
        );
        return Boolean(achado);
      },
      { timeout: prazo, intervals: [100, 250, 500] },
    )
    .toBe(true);
  return achado;
}

async function entrar(page, email, destino = RAIZ) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("senha-do-e2e");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(destino);
}

async function escolherFunil(page, atual, nome) {
  await page.getByRole("combobox").filter({ hasText: atual }).click();
  await page.getByRole("option", { name: nome }).click();
}

async function printDoPainel(context, arquivo) {
  const painel = await context.newPage();
  await painel.goto(`${CONECTA}/_painel`);
  await painel.screenshot({ path: PRINTS + arquivo, fullPage: true });
  await painel.close();
}

/** Todo pedido a `caminho` (o do sinal, por padrão) que sair desta página. */
function vigiarSinais(page, caminho = ROTA) {
  const saidos = [];
  page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname === caminho) saidos.push(pedido);
  });
  return saidos;
}

const vigiarRenovacoes = (page) => vigiarSinais(page, "/api/token/refresh/");
const tokenDaPagina = (page) => page.evaluate(() => localStorage.getItem("crm_access_token"));

// O Conecta falso guarda os sinais entre um teste e outro: sem limpar, o
// `esperarSinal` acharia o sinal do teste anterior.
test.beforeEach(async ({ request }) => {
  await limparSinais(request);
});

test("passo 3: logado, o sinal chega com a tela certa ao abrir e a cada troca de tela", async ({
  page,
  context,
  request,
}) => {
  const saidos = vigiarSinais(page);

  await entrar(page, "ana@e2e.sejaap.com.br");
  const logado = Date.now();
  const funil = await esperarSinal(request, { modulo: "Kanban", tela: PRIMEIRO_FUNIL });
  expect(Date.now() - logado).toBeLessThan(15 * 1000);
  expect(funil).toMatchObject({
    sistema: "CRM",
    com_chave: true,
    pessoa: "ana@e2e.sejaap.com.br",
    corpo: { modulo: "Kanban", tela: PRIMEIRO_FUNIL },
  });
  expect(funil.corpo.identidade_id).toMatch(UUID);
  // A última interação chega com o fuso (o Conecta recusa sem), e é a de agora há pouco.
  expect(funil.corpo.ultima_interacao).toMatch(/([+-]\d\d:\d\d|Z)$/);
  expect(Date.parse(funil.corpo.ultima_interacao)).toBeGreaterThan(logado - 30 * 1000);
  expect(Date.parse(funil.corpo.ultima_interacao)).toBeLessThanOrEqual(Date.now());
  // O pedido do navegador vai ao backend do CRM, com o JWT, e não ao Conecta.
  expect(saidos).toHaveLength(1);
  expect(saidos[0].method()).toBe("POST");
  expect(saidos[0].headers().authorization).toMatch(/^Bearer /);
  await expect(page.getByText("Escola Aprender+")).toBeVisible();
  await page.screenshot({ path: PRINTS + "01-funil-logado.png" });
  await printDoPainel(context, "02-painel-falso-funil.png");

  // Troca de funil pelo seletor: um sinal na hora, com o clique como última interação.
  const antesDoClique = Date.now();
  await escolherFunil(page, "Indicados APN", "Resgate");
  const resgate = await esperarSinal(request, { tela: "Funil Resgate" }, { prazo: 5000 });
  expect(resgate.corpo.modulo).toBe("Kanban");
  expect(Date.parse(resgate.corpo.ultima_interacao)).toBeGreaterThanOrEqual(antesDoClique - 1000);

  // A aba Dashboard é o módulo.
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await esperarSinal(request, { modulo: "Dashboard", tela: "Funil Resgate" }, { prazo: 5000 });
  await page.getByRole("tab", { name: "Kanban" }).click();
  await escolherFunil(page, "Resgate", "Indicados APN");

  // O cartão de um cliente: a tela é "Cliente", e o nome do cliente não vai.
  await limparSinais(request);
  await page.getByText("Escola Aprender+").click();
  await expect(page.getByRole("dialog", { name: /Editar cliente/ })).toBeVisible();
  await esperarSinal(
    request,
    { modulo: "Kanban", tela: `${PRIMEIRO_FUNIL} · Cliente` },
    { prazo: 5000 },
  );
  expect(JSON.stringify(await sinais(request))).not.toContain("Escola");
  await page.screenshot({ path: PRINTS + "03-cartao-do-cliente.png" });
  await printDoPainel(context, "04-painel-falso-cartao-do-cliente.png");
  // Limpa antes do Escape: o sinal da volta sai 500 ms depois dele, e limpar
  // depois de o diálogo sumir poderia apagá-lo.
  await limparSinais(request);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await esperarSinal(request, { modulo: "Kanban", tela: PRIMEIRO_FUNIL }, { prazo: 5000 });

  // A troca de senha é outra rota.
  await page.getByRole("link", { name: "Trocar senha" }).click();
  await expect(page).toHaveURL(/\/trocar-senha$/);
  await esperarSinal(request, { modulo: "Conta", tela: "Troca de senha" }, { prazo: 5000 });

  // O Voltar do navegador: troca de tela sem clique na página, e é a pessoa
  // mexendo (a última interação é a do Voltar, não a do clique anterior).
  await page.waitForTimeout(1500);
  await limparSinais(request);
  const antesDoVoltar = Date.now();
  await page.goBack();
  await expect(page).toHaveURL(RAIZ);
  const voltou = await esperarSinal(request, { modulo: "Kanban" }, { prazo: 5000 });
  expect(voltou.corpo.tela).toBe(PRIMEIRO_FUNIL);
  expect(Date.parse(voltou.corpo.ultima_interacao)).toBeGreaterThanOrEqual(antesDoVoltar - 100);

  // Redirecionamento: o endereço desconhecido volta ao funil. Sai um sinal
  // só, com a tela onde a pessoa ficou.
  await limparSinais(request);
  await page.goto("/endereco-que-nao-existe");
  await expect(page).toHaveURL(RAIZ);
  await esperarSinal(request, { tela: PRIMEIRO_FUNIL }, { prazo: 10 * 1000 });
  await page.waitForTimeout(2000);
  expect((await sinais(request)).map((s) => s.corpo.tela)).toEqual([PRIMEIRO_FUNIL]);
  await printDoPainel(context, "05-painel-falso-redirecionamento-um-sinal.png");
});

test("troca de senha obrigatória: o redirecionamento do login gera um sinal só", async ({
  page,
  request,
}) => {
  const saidos = vigiarSinais(page);

  // O login leva ao funil, e o portão da senha leva à troca obrigatória.
  await entrar(page, "trocar@e2e.sejaap.com.br", /\/trocar-senha$/);
  await esperarSinal(request, { modulo: "Conta", tela: "Troca de senha obrigatória" });
  await page.waitForTimeout(2000);

  expect((await sinais(request)).map((s) => s.corpo.tela)).toEqual(["Troca de senha obrigatória"]);
  expect(saidos).toHaveLength(1);
  await page.screenshot({ path: PRINTS + "06-troca-de-senha-obrigatoria.png" });
});

test("um sinal por minuto com a aba aberta", async ({ page, request }) => {
  // O relógio da página na mão: o minuto passa sem o teste esperar um minuto.
  await page.clock.install();
  await entrar(page, "bia@e2e.sejaap.com.br");
  await esperarSinal(request, { tela: PRIMEIRO_FUNIL });
  await limparSinais(request);
  // Conta o que sai da página, na hora: o que chega ao Conecta falso ainda
  // poderia estar no caminho quando o teste olha.
  const saidos = vigiarSinais(page);

  // A folga de 10 s cobre o tempo de verdade que corre entre um passo e outro.
  await page.clock.runFor(50 * 1000);
  expect(saidos).toHaveLength(0);
  await page.clock.runFor(15 * 1000);
  await esperarSinal(request, { tela: PRIMEIRO_FUNIL }, { prazo: 5000 });
  expect(saidos).toHaveLength(1);

  await page.clock.runFor(2 * 60 * 1000);
  await expect.poll(async () => (await sinais(request)).length, { timeout: 5000 }).toBe(3);
  expect(saidos).toHaveLength(3);
});

test("sem login, a tela de login e as públicas não mandam sinal nenhum", async ({
  page,
  context,
  request,
}) => {
  await page.clock.install();
  const saidos = vigiarSinais(page);

  for (const rota of ["/login", "/esqueci-senha", "/definir-senha", "/"]) {
    await page.goto(rota);
    await page.waitForLoadState("networkidle");
    // Três minutos de tela aberta, com clique e tecla: logado seriam quatro sinais.
    await page.mouse.click(10, 10);
    await page.keyboard.press("Tab");
    await page.clock.runFor(3 * 60 * 1000);
    if (rota === "/") {
      // O "/" sem sessão leva ao login.
      await expect(page).toHaveURL(/\/login$/);
      await page.screenshot({ path: PRINTS + "07-login-sem-sinal.png" });
    }
  }

  expect(saidos.map((p) => p.url())).toEqual([]);
  expect(await sinais(request)).toEqual([]);
  expect(await tokenDaPagina(page)).toBeNull();
  await printDoPainel(context, "08-painel-falso-login-sem-sinal.png");
});

test("o /admin do Django não manda sinal, e a sessão dele é recusada na rota", async ({
  page,
  context,
  request,
}) => {
  // O /admin/ é servido pelo Django, em outra origem: o código da tela nem
  // carrega ali (em produção, o nginx manda /admin/ ao backend), então a
  // contagem abaixo só confirma isso. O que este teste prova de fato é a
  // segunda parte: com a sessão do /admin/, a rota do sinal diz 401.
  const saidos = vigiarSinais(page);

  await page.goto(`${BACKEND}/admin/login/`);
  await page.locator("#id_username").fill("admin@e2e.sejaap.com.br");
  await page.locator("#id_password").fill("senha-do-e2e");
  await page.locator('input[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`${BACKEND}/admin/$`));
  // Logado no /admin/ (staff vindo do Conecta, sem permissão de modelo nenhuma).
  await expect(page.locator("#user-tools")).toBeVisible();
  await page.mouse.click(10, 10);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: PRINTS + "09-admin-django-sem-sinal.png" });

  // Com a sessão do /admin/ (os cookies desta página), a rota diz 401.
  const resposta = await page.request.post(`${BACKEND}${ROTA}`, {
    data: { modulo: "Admin", tela: "Clientes" },
  });
  expect(resposta.status()).toBe(401);

  expect(saidos).toEqual([]);
  expect(await sinais(request)).toEqual([]);
  await printDoPainel(context, "10-painel-falso-admin-sem-sinal.png");
});

test("o erro do sinal não aparece nem tira ninguém do sistema; o 401 renova uma vez só", async ({
  page,
  request,
}) => {
  await entrar(page, "carla@e2e.sejaap.com.br");
  await esperarSinal(request, { tela: PRIMEIRO_FUNIL });
  const renovacoes = vigiarRenovacoes(page);
  const saidos = vigiarSinais(page);

  // A rede caindo e o backend com erro: nada é repetido nem renovado.
  const abas = ["Dashboard", "Kanban"];
  const falhas = ["rede", 500];
  for (const [i, falha] of falhas.entries()) {
    await page.route(`**${ROTA}`, (rota) =>
      falha === "rede"
        ? rota.abort("connectionreset")
        : rota.fulfill({ status: falha, contentType: "application/json", body: '{"detail":"x"}' }),
    );
    const pedido = page.waitForRequest((p) => new URL(p.url()).pathname === ROTA);
    await page.getByRole("tab", { name: abas[i] }).click();
    await pedido;
    await page.waitForTimeout(500);
    await page.unroute(`**${ROTA}`);
  }
  expect(saidos).toHaveLength(2);
  expect(renovacoes).toHaveLength(0);

  // O 401 com a pessoa mexendo (acabou de clicar): uma renovação em silêncio
  // e o mesmo sinal de novo, que também leva 401. Aí o sinal se cala.
  await page.route(`**${ROTA}`, (rota) =>
    rota.fulfill({ status: 401, contentType: "application/json", body: '{"detail":"x"}' }),
  );
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await expect.poll(() => saidos.length, { timeout: 5000 }).toBe(4);
  expect(renovacoes).toHaveLength(1);
  await page.waitForTimeout(500);
  await page.unroute(`**${ROTA}`);

  // O token que levou 401 não é mandado de novo, nem na troca de tela, e não
  // há segunda renovação.
  await page.getByRole("tab", { name: "Kanban" }).click();
  await page.waitForTimeout(1500);
  expect(saidos).toHaveLength(4);
  expect(renovacoes).toHaveLength(1);

  // Nada para a pessoa: sem saída, sem aviso.
  await expect(page).toHaveURL(RAIZ);
  expect(await tokenDaPagina(page)).not.toBeNull();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Escola Aprender+")).toBeVisible();
});

test("o access vencido: quem está parado não renova; quem mexe renova em silêncio e o sinal volta", async ({
  page,
  context,
  request,
}) => {
  // O relógio da página na mão: os 4 minutos passam sem o teste esperar.
  await page.clock.install();
  await entrar(page, "dani@e2e.sejaap.com.br");
  await esperarSinal(request, { tela: PRIMEIRO_FUNIL });
  // Mais de 3 min sem clique nem tecla: a pessoa está parada.
  await page.clock.runFor(3.5 * 60 * 1000);
  // Os sinais desses minutos (aceitos) terminam antes de a contagem começar.
  await page.waitForTimeout(1000);
  const renovacoes = vigiarRenovacoes(page);
  const saidos = vigiarSinais(page);
  const recusas = [];
  page.on("response", (resposta) => {
    if (new URL(resposta.url()).pathname === ROTA && resposta.status() === 401) recusas.push(resposta);
  });

  // O access do CRM vence em 4 h: no lugar dele, um que o backend de verdade recusa.
  await page.evaluate(() => localStorage.setItem("crm_access_token", "access-vencido"));
  await limparSinais(request);
  await page.clock.runFor(65 * 1000);
  await expect.poll(() => recusas.length, { timeout: 5000 }).toBe(1);
  await page.waitForTimeout(1000);
  expect(saidos).toHaveLength(1);
  expect(renovacoes).toHaveLength(0);
  expect(await sinais(request)).toEqual([]);

  // Ela clica: o sinal da troca de tela renova o access e chega ao Conecta.
  await page.getByRole("tab", { name: "Dashboard" }).click();
  await page.clock.runFor(1000);
  await esperarSinal(request, { modulo: "Dashboard", tela: PRIMEIRO_FUNIL }, { prazo: 5000 });
  expect(renovacoes).toHaveLength(1);
  // O token já recusado não foi mandado antes da renovação: só o sinal novo.
  expect(saidos).toHaveLength(2);
  expect(recusas).toHaveLength(1);
  const novo = await tokenDaPagina(page);
  expect(novo).not.toBe("access-vencido");
  expect(novo).not.toBeNull();
  await expect(page).toHaveURL(RAIZ);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await printDoPainel(context, "11-painel-falso-access-renovado.png");
});
