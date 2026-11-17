/**
 * O sinal de presença da tela (TSK-1521), ligado à sessão e à rota.
 *
 * Montado uma vez no `App.jsx`, fora das rotas: o relógio e a última interação
 * sobrevivem à troca de tela. Só manda com a pessoa logada (o `/me` respondeu)
 * e numa tela interna (`telaDaRota`): a tela de login, as de senha públicas e
 * a rota desconhecida ficam caladas. O `/admin/` do Django nem carrega este
 * código (o nginx o manda ao backend), e a rota do sinal recusa a sessão dele.
 *
 * O erro do sinal nunca aparece para a pessoa: sem aviso, sem nova tentativa,
 * sem renovar a sessão nem sair dela (ver `lib/presenca.js`). Não desenha nada.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { criarEnvioDePresenca, criarSinalDePresenca } from "@/lib/presenca";
import { assinarTelaDeclarada, lerTelaDeclarada, telaDaRota } from "@/lib/telaAtual";
import api, { getAccessToken } from "@/services/api";

const enviarPresenca = criarEnvioDePresenca({
  post: (...args) => api.post(...args),
  tokenAtual: getAccessToken,
});

export function SinalDePresenca() {
  const { isAuthenticated, loading, user } = useAuth();
  const { pathname } = useLocation();
  const declarada = useSyncExternalStore(assinarTelaDeclarada, lerTelaDeclarada);
  const onde = isAuthenticated && !loading ? telaDaRota(pathname, declarada, user) : null;
  const modulo = onde?.modulo ?? null;
  const tela = onde?.tela ?? null;

  const relogio = useRef(null);
  useEffect(() => {
    relogio.current = criarSinalDePresenca({ enviar: enviarPresenca });
    return () => {
      relogio.current.destruir();
      relogio.current = null;
    };
  }, []);

  useEffect(() => {
    relogio.current?.definirTela(tela ? { modulo, tela } : null);
  }, [modulo, tela]);

  return null;
}
