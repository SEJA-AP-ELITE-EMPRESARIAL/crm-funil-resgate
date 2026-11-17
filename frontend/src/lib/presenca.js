/**
 * O sinal de presença da tela (TSK-1521): "esta pessoa está nesta tela, e
 * mexeu nela por último neste momento", para o painel "Uso em tempo real" do
 * Conecta. O backend (`POST /api/crm/presenca/`) o repassa ao Conecta e
 * responde 204. Regras do Mathias, 16/11/2026: online = sinal nos últimos
 * 2 min; parado = sem clique nem digitação há mais de 3 min.
 *
 * Dois pedaços, sem React e sem o `api.js`, para rodar no `node --test`:
 *
 * - `criarEnvioDePresenca`: o pedido HTTP, que nunca lança nem aparece para a
 *   pessoa;
 * - `criarSinalDePresenca`: o relógio. Um sinal por minuto com a aba aberta,
 *   também em segundo plano; na troca de tela, um na hora; na volta à aba, um
 *   na hora. Com a última interação de verdade.
 *
 * Quem liga os dois à tela é o `components/SinalDePresenca.jsx`.
 */

export const ROTA_DA_PRESENCA = "/api/crm/presenca/";

/** Um sinal por minuto: o Conecta considera online quem mandou nos últimos 2. */
export const INTERVALO_DO_SINAL_MS = 60 * 1000;
/**
 * A espera curta depois de uma troca de tela. Junta a troca com o
 * redirecionamento que vem logo atrás (a troca de senha obrigatória, a rota
 * desconhecida que volta ao funil, o funil que termina de carregar): sai um
 * sinal só, com a tela onde a pessoa ficou.
 */
export const ESPERA_NA_TROCA_DE_TELA_MS = 500;
/**
 * A volta à aba manda na hora só se o último sinal saiu há pelo menos isto:
 * quem alterna com a planilha a cada poucos segundos não vira um sinal por
 * volta (e não estoura o limite de 20 por minuto do backend).
 */
export const VOLTA_SEM_SINAL_MS = 30 * 1000;
/** O backend responde na hora (o repasse tem teto de 2 s); mais que isto é rede ruim. */
export const TEMPO_MAXIMO_DO_PEDIDO_MS = 15 * 1000;
/**
 * Quem mexeu na tela há menos disto está usando o CRM agora (o "parado" do
 * Conecta é mais de 3 min): só essa pessoa renova o access que o backend
 * recusou ao sinal. Ver `criarEnvioDePresenca`.
 */
export const ATIVA_HA_MENOS_DE_MS = 3 * 60 * 1000;

/**
 * O que conta como interação: clique, tecla e o gesto de rolar (roda do mouse,
 * trackpad e o dedo; as teclas de rolagem já são `keydown`), no `document` e em
 * captura, para nenhum `stopPropagation` da tela (o arrastar do Kanban) o
 * esconder. O evento `scroll`, não: ele dispara também quando a própria página
 * muda a rolagem, e a pessoa parada pareceria ativa no painel. O Voltar e o
 * Avançar do navegador são o `popstate`, na `window`.
 */
export const INTERACOES = ["pointerdown", "keydown", "wheel", "touchmove"];
const OPCOES = { capture: true, passive: true };

/**
 * O pedido do sinal. Resolve `true` se o backend aceitou (204) e `false` em
 * todo o resto; nunca rejeita.
 *
 * - Sem token (ninguém logado), não manda nada.
 * - Toda resposta HTTP volta pelo caminho de sucesso (`validateStatus`): o
 *   interceptor de 401 do `api.js` nem a vê, então o sinal nunca tira ninguém do
 *   sistema. A falha de rede também não (o interceptor só age com status 401).
 * - O access recusado (401) não é mandado de novo: numa aba esquecida aberta de
 *   noite seria um 401 por minuto até de manhã. O sinal volta quando o token
 *   muda (uma ação da pessoa renovou a sessão, ou um login novo).
 * - A exceção é quem está mexendo na tela (`ATIVA_HA_MENOS_DE_MS`): o access do
 *   CRM vence em 4 h, e quem só lê (abrir cartão, trocar de aba e de funil não
 *   chamam a API) sumiria do painel com a aba aberta e em uso. Para ela, o
 *   sinal chama `renovar` (o refresh do `api.js`, sem sair do sistema na
 *   falha) e manda de novo com o access novo. Uma renovação só entre dois
 *   sinais aceitos: se ela falhar, ou o access novo também for recusado, o
 *   sinal fica calado até o token mudar por fora. A aba esquecida não renova.
 * - Nada mais é repetido aqui: o próximo sinal sai no minuto seguinte.
 *
 * @param {object} p
 * @param {(url: string, corpo: object, opcoes: object) => Promise<{status: number}>} p.post  o `api.post`
 * @param {() => string | null} p.tokenAtual  o `getAccessToken` do `api.js`
 * @param {(() => Promise<unknown>) | null} [p.renovar]  o `renovarAcessoEmSilencio` do `api.js`
 */
export function criarEnvioDePresenca({ post, tokenAtual, renovar = null }) {
  let tokenRecusado = null;
  let podeRenovar = true;

  async function postar(corpo) {
    const token = tokenAtual();
    const resposta = await post(ROTA_DA_PRESENCA, corpo, {
      timeout: TEMPO_MAXIMO_DO_PEDIDO_MS,
      validateStatus: () => true,
    });
    if (resposta?.status === 401) tokenRecusado = token;
    if (resposta?.status === 204) podeRenovar = true;
    return resposta?.status;
  }

  /** `true` se renovou e há um access novo para mandar. */
  async function renovarSePuder(ultimaInteracao) {
    if (!renovar || !podeRenovar || tokenAtual() !== tokenRecusado) return false;
    if (!Number.isFinite(ultimaInteracao) || Date.now() - ultimaInteracao >= ATIVA_HA_MENOS_DE_MS) {
      return false;
    }
    podeRenovar = false;
    try {
      await renovar();
    } catch {
      return false;
    }
    const novo = tokenAtual();
    return Boolean(novo) && novo !== tokenRecusado;
  }

  return async function enviarPresenca({ modulo, tela, ultimaInteracao = null }) {
    try {
      if (!tokenAtual()) return false;
      if (typeof tela !== "string" || !tela) return false;
      const corpo = { modulo: typeof modulo === "string" ? modulo : "", tela };
      // Fora do intervalo do `Date` o `toISOString` lançaria: aí o sinal vai sem ela.
      const quando = Number.isFinite(ultimaInteracao) ? new Date(ultimaInteracao) : null;
      if (quando && !Number.isNaN(quando.getTime())) corpo.ultima_interacao = quando.toISOString();
      if (tokenAtual() === tokenRecusado && !(await renovarSePuder(ultimaInteracao))) return false;
      let status = await postar(corpo);
      if (status === 401 && (await renovarSePuder(ultimaInteracao))) status = await postar(corpo);
      return status === 204;
    } catch {
      return false;
    }
  };
}

function mesmaTela(uma, outra) {
  if (!uma || !outra) return uma === outra;
  return uma.modulo === outra.modulo && uma.tela === outra.tela;
}

/**
 * O relógio do sinal. Começa sem tela (calado); `definirTela` diz onde a pessoa
 * está, ou `null` para calar (sem login, tela pública).
 *
 * - Ao ganhar uma tela, ou trocar de tela, um sinal depois de
 *   `ESPERA_NA_TROCA_DE_TELA_MS`, e o minuto recomeça dali. Trocar de novo
 *   dentro da espera (o redirecionamento) cancela o primeiro: sai um só.
 * - Um sinal a cada `INTERVALO_DO_SINAL_MS`, também com a aba escondida (o
 *   navegador pode atrasar o relógio dela; por isso a volta, abaixo).
 * - Na volta à aba, um sinal na hora, e o minuto recomeça dali, se o último
 *   saiu há `VOLTA_SEM_SINAL_MS` ou mais.
 * - A última interação é o último clique, tecla, gesto de rolagem ou
 *   Voltar/Avançar, em qualquer lugar da página. Antes do primeiro, vale a
 *   criação do relógio: abrir ou recarregar o CRM já é a pessoa mexendo nele.
 *   O sinal do minuto e a troca de tela por redirecionamento não contam.
 *
 * Nada fica guardado no navegador. `destruir` solta tudo.
 *
 * @param {object} p
 * @param {(sinal: {modulo: string, tela: string, ultimaInteracao: number}) => unknown} p.enviar
 * @param {Document | EventTarget} [p.documento]
 * @param {Window | EventTarget} [p.janela]
 */
export function criarSinalDePresenca({
  enviar,
  documento = globalThis.document,
  janela = globalThis.window,
}) {
  let tela = null;
  let ultimaInteracao = Date.now();
  let ultimoEnvio = null;
  let proximo = null;

  const marcar = () => {
    ultimaInteracao = Date.now();
  };

  function parar() {
    clearTimeout(proximo);
    proximo = null;
  }

  function mandar() {
    parar();
    if (!tela) return;
    ultimoEnvio = Date.now();
    try {
      // `enviar` já nunca rejeita; a guarda é para um erro nunca subir à tela.
      Promise.resolve(enviar({ ...tela, ultimaInteracao })).catch(() => {});
    } catch {
      // idem
    }
    proximo = setTimeout(mandar, INTERVALO_DO_SINAL_MS);
  }

  function aoVoltar() {
    if (documento?.visibilityState !== "visible" || !tela) return;
    if (ultimoEnvio !== null && Date.now() - ultimoEnvio < VOLTA_SEM_SINAL_MS) return;
    mandar();
  }

  INTERACOES.forEach((evento) => documento?.addEventListener(evento, marcar, OPCOES));
  janela?.addEventListener("popstate", marcar);
  documento?.addEventListener("visibilitychange", aoVoltar);

  return {
    /** @param {{modulo: string, tela: string} | null} nova */
    definirTela(nova) {
      const valida = nova && typeof nova.tela === "string" && nova.tela ? nova : null;
      if (mesmaTela(valida, tela)) return;
      tela = valida ? { modulo: valida.modulo || "", tela: valida.tela } : null;
      parar();
      if (tela) proximo = setTimeout(mandar, ESPERA_NA_TROCA_DE_TELA_MS);
    },
    destruir() {
      parar();
      tela = null;
      INTERACOES.forEach((evento) => documento?.removeEventListener(evento, marcar, OPCOES));
      janela?.removeEventListener("popstate", marcar);
      documento?.removeEventListener("visibilitychange", aoVoltar);
    },
  };
}
