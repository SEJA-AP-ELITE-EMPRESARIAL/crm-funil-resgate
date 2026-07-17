/**
 * Estado compartilhado da carteira de clientes + funis.
 * Carrega a base uma vez e serve Kanban, Dashboard e Comissionamento.
 * `funilSel` é o seletor global: "all" (todos os funis) ou o slug de um funil.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useEffect } from "react";

import {
  atualizarCliente,
  listarClientes,
  listarFunis,
  obterConfig,
} from "@/features/funil/services/clientesService";

const Ctx = createContext(null);

const CONFIG_PADRAO = { comissao_rate: 0.03, meses_contrato_padrao: 12 };

export function ClientesProvider({ children }) {
  const [clientes, setClientes] = useState([]);
  const [funis, setFunis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [funilSel, setFunilSel] = useState("all");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, fs, cfg] = await Promise.all([listarClientes(), listarFunis(), obterConfig()]);
      setClientes(cs);
      setFunis(fs);
      setConfig(cfg || CONFIG_PADRAO);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Clientes do funil selecionado (todos quando "all"). */
  const clientesDoFunil = useMemo(() => {
    if (funilSel === "all") return clientes;
    return clientes.filter((c) => c.funil_slug === funilSel);
  }, [clientes, funilSel]);

  /** Move um cliente de etapa com atualização otimista + rollback. */
  const moverEtapa = useCallback(async (id, etapa) => {
    let anterior;
    setClientes((cs) => {
      anterior = cs;
      return cs.map((c) => (c.id === id ? { ...c, etapa } : c));
    });
    try {
      const atualizado = await atualizarCliente(id, { etapa });
      setClientes((cs) => cs.map((c) => (c.id === id ? atualizado : c)));
    } catch (e) {
      setClientes(anterior);
      throw e;
    }
  }, []);

  const value = useMemo(
    () => ({
      clientes,
      clientesDoFunil,
      funis,
      funilSel,
      setFunilSel,
      loading,
      config,
      reload,
      moverEtapa,
    }),
    [clientes, clientesDoFunil, funis, funilSel, loading, config, reload, moverEtapa],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClientesData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClientesData deve estar dentro de <ClientesProvider>");
  return ctx;
}
