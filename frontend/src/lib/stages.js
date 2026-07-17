/**
 * Fonte única das etapas do funil de resgate.
 * Os `value` batem com o EtapaFunil (TextChoices) do backend.
 * Cores extraídas do MVP (variáveis --stage-*), convertidas para hex.
 */
export const STAGES = [
  "priorizado",
  "contato_realizado",
  "conectado",
  "diagnostico",
  "proposta",
  "reativado",
  "perdido",
];

/** Etapas de progressão (exclui "Perdido") — usadas no gráfico de conversão. */
export const PROGRESS_STAGES = STAGES.filter((s) => s !== "perdido");

export const STAGE_META = {
  priorizado: {
    label: "Priorizado",
    color: "#E4B744",
    description: "Selecionado para tentativa de resgate",
  },
  contato_realizado: {
    label: "Contato Realizado",
    color: "#EA932E",
    description: "Primeiro contato (ligação/mensagem)",
  },
  conectado: {
    label: "Conectado",
    color: "#E77123",
    description: "Conversa efetiva com decisor",
  },
  diagnostico: {
    label: "Diagnóstico",
    color: "#DF5B3A",
    description: "Entendimento da dor / oportunidade",
  },
  proposta: {
    label: "Proposta",
    color: "#B069D3",
    description: "Proposta comercial enviada",
  },
  reativado: {
    label: "Reativado",
    color: "#31C47F",
    description: "Cliente voltou a contratar",
  },
  perdido: {
    label: "Perdido",
    color: "#666666",
    description: "Descartado definitivamente",
  },
};

/** Mapa etapa -> hex, derivado de STAGE_META. */
export const STAGE_COLORS = Object.fromEntries(
  Object.entries(STAGE_META).map(([k, v]) => [k, v.color]),
);

/** Rótulo legível de uma etapa (ou "—" quando fora do funil). */
export const stageLabel = (value) => STAGE_META[value]?.label ?? "—";
