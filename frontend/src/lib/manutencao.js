/**
 * Login central em manutenção (TSK-1240).
 *
 * Com o Conecta em manutenção, o `/api/token/` responde 503 com
 * `{ erro: "manutencao", mensagem, previsao }`, e a tela de login troca o
 * formulário por "Temporariamente indisponível / Em manutenção". Um 503 sem
 * esse `erro` é o "tente em instantes" de sempre.
 */

/**
 * `{ mensagem, previsao }` quando o erro do axios é o da manutenção; `null` no
 * resto (inclusive o 503 de serviço fora do ar).
 */
export function lerManutencao(error) {
  const resposta = error?.response;
  if (resposta?.status !== 503 || resposta.data?.erro !== "manutencao") return null;
  return {
    mensagem: resposta.data.mensagem || "",
    previsao: resposta.data.previsao || null,
  };
}

/**
 * A data prevista de volta como a pessoa lê: "3 de novembro, às 19:30", no
 * fuso de quem olha. `null` quando não há previsão ou ela não é uma data.
 */
export function formatarPrevisao(previsao, fuso) {
  if (!previsao) return null;
  const data = new Date(previsao);
  if (Number.isNaN(data.getTime())) return null;
  const dia = data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: fuso });
  const hora = data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: fuso,
  });
  return `${dia}, às ${hora}`;
}
