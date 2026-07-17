import { useMemo, useState } from "react";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { Alert, Box, Skeleton, Snackbar, Stack } from "@mui/material";

import { ClienteCard } from "@/components/funil/ClienteCard";
import { ClienteFormDialog } from "@/components/funil/ClienteFormDialog";
import { StageColumn } from "@/components/funil/StageColumn";
import { useClientesData } from "@/contexts/ClientesContext";
import { STAGES, STAGE_META } from "@/lib/stages";

export function KanbanBoard({ filterConsultor, filterMotivo, search }) {
  const { clientesDoFunil: clientes, loading, moverEtapa } = useClientesData();
  const [activeId, setActiveId] = useState(null);
  const [snack, setSnack] = useState(null);
  const [editando, setEditando] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filtered = useMemo(() => {
    return clientes.filter((c) => {
      if (!c.etapa) return false;
      if (filterConsultor !== "all" && (c.quem_fara_contato || "Sem Consultor") !== filterConsultor) return false;
      if (filterMotivo !== "all" && (c.motivo_distrato || "Não Informado") !== filterMotivo) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${c.nome} ${c.quem_fara_contato || ""} ${c.municipio || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [clientes, filterConsultor, filterMotivo, search]);

  const byStage = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s, []]));
    filtered.forEach((c) => {
      if (m[c.etapa]) m[c.etapa].push(c);
    });
    return m;
  }, [filtered]);

  const activeCliente = useMemo(
    () => clientes.find((c) => c.id === activeId) ?? null,
    [clientes, activeId],
  );

  function handleDragStart(e) {
    setActiveId(e.active.id);
  }

  async function handleDragEnd(e) {
    setActiveId(null);
    if (!e.over) return;
    const novaEtapa = e.over.id;
    const cliente = clientes.find((c) => c.id === e.active.id);
    if (!cliente || cliente.etapa === novaEtapa) return;
    try {
      await moverEtapa(cliente.id, novaEtapa);
      setSnack({ sev: "success", msg: `${cliente.nome} → ${STAGE_META[novaEtapa].label}` });
    } catch {
      setSnack({ sev: "error", msg: "Falha ao mover cliente" });
    }
  }

  if (loading) {
    return (
      <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 2 }}>
        {STAGES.map((s) => (
          <Box key={s} sx={{ width: 288, flexShrink: 0 }}>
            <Skeleton height={28} width={128} sx={{ mb: 1 }} />
            <Skeleton variant="rounded" height={96} sx={{ mb: 1 }} />
            <Skeleton variant="rounded" height={96} />
          </Box>
        ))}
      </Stack>
    );
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 2 }}>
          {STAGES.map((stage) => (
            <StageColumn key={stage} stage={stage} clientes={byStage[stage]} onEdit={setEditando} />
          ))}
        </Stack>
        <DragOverlay>
          {activeCliente ? (
            <Box sx={{ transform: "rotate(2deg)", opacity: 0.9 }}>
              <ClienteCard cliente={activeCliente} overlay />
            </Box>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Snackbar
        open={!!snack}
        autoHideDuration={2500}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {snack ? (
          <Alert severity={snack.sev} variant="filled" onClose={() => setSnack(null)}>
            {snack.msg}
          </Alert>
        ) : undefined}
      </Snackbar>

      <ClienteFormDialog open={!!editando} cliente={editando} onClose={() => setEditando(null)} />
    </>
  );
}
