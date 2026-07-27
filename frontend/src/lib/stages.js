/**
 * Helpers das etapas (colunas do Kanban).
 *
 * As etapas deixaram de ser uma lista fixa no front: cada funil tem as suas,
 * criadas pela interface e servidas pela API (embutidas em /api/crm/funis/).
 * O que sobra aqui são utilitários sobre esses dados.
 */

/** Tipos de etapa — espelham o TipoEtapa do backend. */
export const TIPOS = {
  progressao: { label: "Progressão", desc: "Passo normal da esteira" },
  ganho: { label: "Ganho", desc: "Fecha o funil com sucesso" },
  perda: { label: "Perda", desc: "Sai do funil sem sucesso" },
  auxiliar: { label: "Auxiliar", desc: "Fora da esteira (ex.: Follow-up)" },
};

export const CORES_SUGERIDAS = [
  "#E4B744", "#EA932E", "#E77123", "#DF5B3A",
  "#B069D3", "#31C47F", "#3D7EC5", "#666666",
];

/** Etapas que formam a esteira de conversão (progressão + ganho, na ordem). */
export const etapasDaEsteira = (etapas = []) =>
  etapas.filter((e) => e.tipo === "progressao" || e.tipo === "ganho");

/** Nome com emoji, como a coluna aparece no board. */
export const rotuloEtapa = (etapa) =>
  etapa ? (etapa.rotulo || `${etapa.emoji || ""} ${etapa.nome}`.trim()) : "—";

/** Índice de uma etapa dentro da esteira (-1 se estiver fora dela). */
export const posicaoNaEsteira = (etapas, etapaId) =>
  etapasDaEsteira(etapas).findIndex((e) => e.id === etapaId);
