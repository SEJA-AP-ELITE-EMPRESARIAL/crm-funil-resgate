import { useMemo, useState } from "react";

import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import { ClienteCard } from "@/components/funil/ClienteCard";
import { ClienteFormDialog } from "@/components/funil/ClienteFormDialog";
import { EtapaFormDialog } from "@/components/funil/EtapaFormDialog";
import { StageColumn } from "@/components/funil/StageColumn";
import { useClientesData } from "@/contexts/ClientesContext";

// Altura do board limitada à viewport (descontando header + filtros), para que a
// barra de rolagem horizontal fique sempre visível sem precisar descer a página.
const BOARD_HEIGHT = { xs: "auto", md: "calc(100vh - 210px)" };

export function KanbanBoard({ filterConsultor, filterMotivo, search }) {
  const {
    clientesDoFunil: clientes,
    etapas,
    funilAtivo,
    loading,
    moverEtapa,
    excluirEtapa,
    moverColuna,
  } = useClientesData();

  const [activeId, setActiveId] = useState(null);
  const [snack, setSnack] = useState(null);
  const [editando, setEditando] = useState(null);
  const [colunaForm, setColunaForm] = useState(null); // {aberto, etapa}
  const [confirmarExclusao, setConfirmarExclusao] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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

  const porEtapa = useMemo(() => {
    const m = Object.fromEntries(etapas.map((e) => [e.id, []]));
    filtered.forEach((c) => {
      if (m[c.etapa]) m[c.etapa].push(c);
    });
    return m;
  }, [filtered, etapas]);

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
    const novaEtapaId = e.over.id;
    const cliente = clientes.find((c) => c.id === e.active.id);
    if (!cliente || cliente.etapa === novaEtapaId) return;
    const destino = etapas.find((s) => s.id === novaEtapaId);
    try {
      await moverEtapa(cliente.id, novaEtapaId);
      setSnack({ sev: "success", msg: `${cliente.nome} → ${destino?.nome ?? "coluna"}` });
    } catch {
      setSnack({ sev: "error", msg: "Falha ao mover cliente" });
    }
  }

  async function confirmarExcluir() {
    const etapa = confirmarExclusao;
    setConfirmarExclusao(null);
    try {
      await excluirEtapa(etapa.id);
      setSnack({ sev: "success", msg: `Coluna "${etapa.nome}" excluída` });
    } catch (e) {
      setSnack({
        sev: "error",
        msg: e?.response?.data?.erro || "Não foi possível excluir a coluna",
      });
    }
  }

  async function mover(id, direcao) {
    try {
      await moverColuna(id, direcao);
    } catch {
      setSnack({ sev: "error", msg: "Falha ao reordenar as colunas" });
    }
  }

  if (loading) {
    return (
      <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 2, height: BOARD_HEIGHT }}>
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} sx={{ width: 288, flexShrink: 0 }}>
            <Skeleton height={28} width={128} sx={{ mb: 1 }} />
            <Skeleton variant="rounded" height={96} sx={{ mb: 1 }} />
            <Skeleton variant="rounded" height={96} />
          </Box>
        ))}
      </Stack>
    );
  }

  const botaoNovaColuna = (
    <Button
      onClick={() => setColunaForm({ aberto: true, etapa: null })}
      startIcon={<AddRoundedIcon />}
      variant="outlined"
      sx={{ whiteSpace: "nowrap" }}
    >
      Nova coluna
    </Button>
  );

  return (
    <>
      {etapas.length === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            py: 10,
            px: 3,
            textAlign: "center",
            borderRadius: 3,
            border: "2px dashed",
            borderColor: "divider",
            bgcolor: (t) => alpha(t.palette.background.paper, 0.4),
          }}
        >
          <ViewColumnRoundedIcon sx={{ fontSize: 44, color: "text.disabled" }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {funilAtivo?.nome} ainda não tem colunas
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, maxWidth: 460 }}>
              Cada funil tem o próprio fluxo. Crie as colunas que fazem sentido para este —
              elas podem ser renomeadas, reordenadas e excluídas depois.
            </Typography>
          </Box>
          {botaoNovaColuna}
        </Box>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <Stack
            direction="row"
            spacing={2}
            sx={{ overflowX: "auto", overflowY: "hidden", pb: 2, height: BOARD_HEIGHT, alignItems: "stretch" }}
          >
            {etapas.map((etapa, i) => (
              <StageColumn
                key={etapa.id}
                etapa={etapa}
                clientes={porEtapa[etapa.id] ?? []}
                onEdit={setEditando}
                onEditarColuna={(e) => setColunaForm({ aberto: true, etapa: e })}
                onExcluirColuna={setConfirmarExclusao}
                onMover={mover}
                primeira={i === 0}
                ultima={i === etapas.length - 1}
              />
            ))}
            <Box sx={{ flexShrink: 0, pt: 4.5, pr: 1 }}>{botaoNovaColuna}</Box>
          </Stack>
          <DragOverlay>
            {activeCliente ? (
              <Box sx={{ transform: "rotate(2deg)", opacity: 0.9 }}>
                <ClienteCard cliente={activeCliente} overlay />
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3500}
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

      <EtapaFormDialog
        open={!!colunaForm?.aberto}
        etapa={colunaForm?.etapa}
        onClose={() => setColunaForm(null)}
      />

      <Dialog open={!!confirmarExclusao} onClose={() => setConfirmarExclusao(null)} maxWidth="xs">
        <DialogTitle>Excluir coluna?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            A coluna <b>{confirmarExclusao?.nome}</b> será removida deste funil. Colunas com
            clientes não podem ser excluídas — mova os cartões antes.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmarExclusao(null)} color="inherit">
            Cancelar
          </Button>
          <Button onClick={confirmarExcluir} color="error" variant="contained">
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
