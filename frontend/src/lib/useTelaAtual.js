/**
 * Os hooks com que a página do funil e as janelas dela dizem onde a pessoa
 * está, para o sinal de presença (TSK-1521). Os textos e o estado moram em
 * `telaAtual.js`; quem manda o sinal é o `components/SinalDePresenca.jsx`.
 */
import { useEffect } from "react";

import { abrirDetalhe, declararPagina } from "@/lib/telaAtual";

/**
 * A página do funil: a aba e o nome do funil escolhido. `pronta` falso (a base
 * ainda carregando pela primeira vez) não declara nada, para o primeiro sinal
 * já sair com o funil.
 */
export function useTelaDoFunil({ pronta, aba, funil }) {
  useEffect(() => {
    if (!pronta) return undefined;
    return declararPagina({ aba, funil: funil || "" });
  }, [pronta, aba, funil]);
}

/** Uma janela que conta como tela, enquanto `aberta`. `codigo` é uma chave de `DETALHES`. */
export function useDetalheDaTela(aberta, codigo) {
  useEffect(() => {
    if (!aberta) return undefined;
    return abrirDetalhe(codigo);
  }, [aberta, codigo]);
}
