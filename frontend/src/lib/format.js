/** Formatação e parsing de valores em pt-BR. */

export const fmtBRL = (n, maxFrac = 0) =>
  Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: maxFrac,
  });

/** Converte "12.500,00" (pt-BR) OU "12500.50" para Number. */
export function parseValorBR(texto) {
  if (texto == null || texto === "") return null;
  let s = String(texto).trim();
  if (s.includes(",")) {
    // formato pt-BR: ponto é milhar, vírgula é decimal
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

export const num = (v) => {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
};
