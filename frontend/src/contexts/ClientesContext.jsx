/**
 * Estado compartilhado da carteira de clientes + funis + colunas.
 *
 * Carrega a base uma vez e serve Kanban e Dashboard. `funilSel` é o seletor
 * global — **sempre um funil**: a opção "todos" saiu quando cada funil passou a
 * ter as próprias colunas (misturar colunas de funis diferentes num board só
 * não significa nada).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  atualizarCliente,
  atualizarEtapa,
  criarEtapa,
  listarClientes,
  listarFunis,
  obterConfig,
  removerEtapa,
  reordenarEtapas,
} from "@/features/funil/services/clientesService";

const Ctx = createContext(null);

const CONFIG_PADRAO = { comissao_rate: 0.03, meses_contrato_padrao: 12 };

export function ClientesProvider({ children }) {
  const [clientes, setClientes] = useState([]);
  const [funis, setFunis] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [funilSel, setFunilSel] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, fs, cfg] = await Promise.all([listarClientes(), listarFunis(), obterConfig()]);
      setClientes(cs);
      setFunis(fs);
      setConfig(cfg || CONFIG_PADRAO);
      // Sem "todos": entra no primeiro funil e só sai por escolha do usuário.
      setFunilSel((atual) => (atual && fs.some((f) => f.slug === atual) ? atual : fs[0]?.slug ?? null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const funilAtivo = useMemo(
    () => funis.find((f) => f.slug === funilSel) ?? null,
    [funis, funilSel],
  );

  /** Colunas do funil selecionado, na ordem do board. */
  const etapas = useMemo(
    () => [...(funilAtivo?.etapas ?? [])].sort((a, b) => a.ordem - b.ordem || a.id - b.id),
    [funilAtivo],
  );

  const clientesDoFunil = useMemo(
    () => (funilSel ? clientes.filter((c) => c.funil_slug === funilSel) : []),
    [clientes, funilSel],
  );

  /** Substitui as etapas do funil ativo no estado local, sem recarregar tudo. */
  const aplicarEtapas = useCallback((funilId, transformacao) => {
    setFunis((fs) =>
      fs.map((f) => (f.id === funilId ? { ...f, etapas: transformacao(f.etapas ?? []) } : f)),
    );
  }, []);

  /** Move um cliente de etapa com atualização otimista + rollback. */
  const moverEtapa = useCallback(async (id, etapaId) => {
    let anterior;
    setClientes((cs) => {
      anterior = cs;
      return cs.map((c) => (c.id === id ? { ...c, etapa: etapaId } : c));
    });
    try {
      const atualizado = await atualizarCliente(id, { etapa: etapaId });
      setClientes((cs) => cs.map((c) => (c.id === id ? atualizado : c)));
    } catch (e) {
      setClientes(anterior);
      throw e;
    }
  }, []);

  /* === Gestão de colunas === */

  const novaEtapa = useCallback(
    async (dados) => {
      const criada = await criarEtapa({ ...dados, funil: funilAtivo.id });
      aplicarEtapas(funilAtivo.id, (es) => [...es, criada]);
      return criada;
    },
    [funilAtivo, aplicarEtapas],
  );

  const editarEtapa = useCallback(
    async (id, patch) => {
      const atualizada = await atualizarEtapa(id, patch);
      aplicarEtapas(funilAtivo.id, (es) => es.map((e) => (e.id === id ? atualizada : e)));
      return atualizada;
    },
    [funilAtivo, aplicarEtapas],
  );

  const excluirEtapa = useCallback(
    async (id) => {
      await removerEtapa(id);
      aplicarEtapas(funilAtivo.id, (es) => es.filter((e) => e.id !== id));
    },
    [funilAtivo, aplicarEtapas],
  );

  /** Move a coluna uma posição para a esquerda (-1) ou direita (+1). */
  const moverColuna = useCallback(
    async (id, direcao) => {
      const ordenadas = [...etapas];
      const i = ordenadas.findIndex((e) => e.id === id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= ordenadas.length) return;
      [ordenadas[i], ordenadas[j]] = [ordenadas[j], ordenadas[i]];

      const comOrdem = ordenadas.map((e, idx) => ({ ...e, ordem: idx }));
      aplicarEtapas(funilAtivo.id, () => comOrdem); // otimista
      try {
        const salvas = await reordenarEtapas(funilAtivo.id, ordenadas.map((e) => e.id));
        aplicarEtapas(funilAtivo.id, () => salvas);
      } catch (e) {
        aplicarEtapas(funilAtivo.id, () => etapas);
        throw e;
      }
    },
    [etapas, funilAtivo, aplicarEtapas],
  );

  const value = useMemo(
    () => ({
      clientes,
      clientesDoFunil,
      funis,
      funilSel,
      setFunilSel,
      funilAtivo,
      etapas,
      loading,
      config,
      reload,
      moverEtapa,
      novaEtapa,
      editarEtapa,
      excluirEtapa,
      moverColuna,
    }),
    [
      clientes, clientesDoFunil, funis, funilSel, funilAtivo, etapas, loading, config,
      reload, moverEtapa, novaEtapa, editarEtapa, excluirEtapa, moverColuna,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClientesData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClientesData deve estar dentro de <ClientesProvider>");
  return ctx;
}
