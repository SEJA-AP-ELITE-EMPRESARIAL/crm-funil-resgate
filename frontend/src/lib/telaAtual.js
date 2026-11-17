/**
 * Onde a pessoa está, em texto curto, para o painel "Uso em tempo real" do
 * Conecta (TSK-1521). É o `modulo · tela` do sinal de presença.
 *
 * O CRM tem praticamente uma rota só (`/`): o que muda é a aba (Kanban ou
 * Dashboard), o funil escolhido e a janela aberta por cima (o cartão de um
 * cliente, a importação...). Por isso a tela não sai só do endereço: a página
 * do funil e as janelas dela DECLARAM onde a pessoa está (`declararPagina`,
 * `abrirDetalhe`, pelos hooks de `useTelaAtual.js`), e `telaDaRota` junta a
 * rota com o que foi declarado. Todos os textos moram aqui:
 *
 * | Onde                                         | módulo    | tela                                   |
 * |----------------------------------------------|-----------|----------------------------------------|
 * | `/`, aba Kanban                              | Kanban    | Funil Resgate                          |
 * | `/`, aba Dashboard                           | Dashboard | Funil Resgate                          |
 * | `/`, cartão de um cliente ("Editar cliente") | a aba     | Funil Resgate · Cliente                |
 * | `/`, "Novo cliente"                          | a aba     | Funil Resgate · Novo cliente           |
 * | `/`, "Importar clientes de Excel"            | a aba     | Funil Resgate · Importação de clientes |
 * | `/`, "Editar funil"                          | a aba     | Funil Resgate · Edição do funil        |
 * | `/`, "Novo funil"                            | a aba     | Novo funil                             |
 * | `/`, "Editar coluna"                         | a aba     | Funil Resgate · Edição de coluna       |
 * | `/`, "Nova coluna"                           | a aba     | Funil Resgate · Nova coluna            |
 * | `/`, sem funil nenhum                        | a aba     | Sem funil                              |
 * | `/trocar-senha`                              | Conta     | Troca de senha                         |
 * | `/trocar-senha`, troca obrigatória           | Conta     | Troca de senha obrigatória             |
 * | `/login`, `/esqueci-senha`, `/definir-senha`, outra rota | — | nenhum sinal                     |
 *
 * "Funil Resgate" é "Funil " + o nome do funil escolhido (sem repetir quando o
 * nome já começa com "Funil").
 *
 * O nome do cliente não vai ao Conecta: é dado de lead (o mesmo cuidado do
 * GlitchTip, TSK-1147). O do funil vai, porque é configuração da equipe. Os
 * textos ficam curtos: o Conecta grava até 60 caracteres de módulo e 120 de
 * tela (com reticências). Mudou uma rota no App.jsx ou uma janela, mude aqui.
 *
 * Sem `import`: roda no `node --test`.
 */

export const TAMANHO_DO_MODULO = 60;
export const TAMANHO_DA_TELA = 120;

const ABAS = { kanban: "Kanban", dashboard: "Dashboard" };

/** O texto de cada janela que conta como tela, pelo código que ela declara. */
export const DETALHES = {
  cliente: "Cliente",
  novoCliente: "Novo cliente",
  importacao: "Importação de clientes",
  edicaoDoFunil: "Edição do funil",
  novoFunil: "Novo funil",
  edicaoDeColuna: "Edição de coluna",
  novaColuna: "Nova coluna",
};

/** Uma linha só, sem espaço sobrando, cortada em `limite` com reticências. */
export function textoCurto(valor, limite) {
  const texto = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto;
}

function nomeDoFunil(nome) {
  const limpo = textoCurto(nome, 80);
  if (!limpo) return "";
  // "Funil Resgate", mas não "Funil Funil de Resgate". Sem `\b`: no JS ele
  // vê fronteira de palavra antes do "á" de "Funilária".
  return /^funil(?![\p{L}\p{N}_])/iu.test(limpo) ? limpo : `Funil ${limpo}`;
}

function telaDoFunil(pagina, detalhe) {
  const modulo = ABAS[pagina.aba] || ABAS.kanban;
  const funil = nomeDoFunil(pagina.funil);
  const janela = DETALHES[detalhe] || "";
  // O novo funil não é "dentro" do funil de antes.
  const partes = detalhe === "novoFunil" ? [janela] : [funil || "Sem funil", janela];
  return { modulo, tela: partes.filter(Boolean).join(" · ") };
}

/**
 * `{ modulo, tela }` de onde a pessoa está, ou `null` quando não há sinal a
 * mandar: rota pública, rota desconhecida (o `*` do App.jsx a leva ao `/`) ou
 * a página do funil ainda carregando (o primeiro sinal já sai com o funil).
 *
 * @param {string} pathname  o `useLocation().pathname`
 * @param {{ pagina: {aba: string, funil: string} | null, detalhe: string | null }} declarada
 * @param {{ precisa_trocar_senha?: boolean } | null} [usuario]
 */
export function telaDaRota(pathname, declarada, usuario = null) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return null;
  const caminho = pathname.replace(/\/+$/, "") || "/";
  let onde = null;
  if (caminho === "/" && declarada?.pagina) {
    onde = telaDoFunil(declarada.pagina, declarada.detalhe);
  } else if (caminho === "/trocar-senha") {
    onde = {
      modulo: "Conta",
      tela: usuario?.precisa_trocar_senha ? "Troca de senha obrigatória" : "Troca de senha",
    };
  }
  if (!onde) return null;
  return {
    modulo: textoCurto(onde.modulo, TAMANHO_DO_MODULO),
    tela: textoCurto(onde.tela, TAMANHO_DA_TELA),
  };
}

// === O que a tela declarou =================================================
// Um estado só, do módulo: há uma tela aberta por aba. A página do funil
// declara a aba e o funil; cada janela aberta declara o código dela, e vale a
// aberta por último (a confirmação de exclusão não declara nada e mantém a de
// baixo).

let pagina = null;
const detalhes = [];
const ouvintes = new Set();
let instantaneo = { pagina: null, detalhe: null };

function avisar() {
  const detalhe = detalhes.length ? detalhes[detalhes.length - 1].codigo : null;
  if (instantaneo.pagina === pagina && instantaneo.detalhe === detalhe) return;
  instantaneo = { pagina, detalhe };
  ouvintes.forEach((ouvinte) => ouvinte());
}

/** A página do funil diz a aba e o funil. Devolve a função que a retira. */
export function declararPagina({ aba, funil }) {
  const declarada = { aba, funil };
  pagina = declarada;
  avisar();
  return () => {
    if (pagina === declarada) {
      pagina = null;
      avisar();
    }
  };
}

/** Uma janela aberta diz o código dela (ver `DETALHES`). Devolve a função que a fecha. */
export function abrirDetalhe(codigo) {
  const aberta = { codigo };
  detalhes.push(aberta);
  avisar();
  return () => {
    const posicao = detalhes.indexOf(aberta);
    if (posicao >= 0) {
      detalhes.splice(posicao, 1);
      avisar();
    }
  };
}

/** Para o `useSyncExternalStore`: o mesmo objeto enquanto nada muda. */
export function lerTelaDeclarada() {
  return instantaneo;
}

export function assinarTelaDeclarada(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
