import { useState } from "react";

import { useDroppable } from "@dnd-kit/core";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import { Box, IconButton, ListItemIcon, Menu, MenuItem, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { ClienteCard } from "@/components/funil/ClienteCard";

export function StageColumn({
  etapa,
  clientes,
  onEdit,
  onEditarColuna,
  onExcluirColuna,
  onMover,
  primeira,
  ultima,
}) {
  const { isOver, setNodeRef } = useDroppable({ id: etapa.id });
  const [menu, setMenu] = useState(null);

  const fechar = () => setMenu(null);
  const acao = (fn) => () => {
    fechar();
    fn();
  };

  return (
    <Box sx={{ width: 288, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          {etapa.emoji ? (
            <Box component="span" sx={{ fontSize: 15, lineHeight: 1 }}>
              {etapa.emoji}
            </Box>
          ) : (
            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: etapa.cor }} />
          )}
          <Typography variant="body2" sx={{ fontWeight: 600, noWrap: true }} noWrap title={etapa.nome}>
            {etapa.nome}
          </Typography>
        </Stack>

        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Box
            sx={{
              px: 1,
              py: 0.25,
              borderRadius: 1.5,
              bgcolor: "action.hover",
              fontSize: 12,
              fontWeight: 600,
              color: "text.secondary",
            }}
          >
            {clientes.length}
          </Box>
          <IconButton size="small" onClick={(e) => setMenu(e.currentTarget)} aria-label="Opções da coluna">
            <MoreVertRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </Stack>

      <Menu anchorEl={menu} open={!!menu} onClose={fechar}>
        <MenuItem onClick={acao(() => onEditarColuna(etapa))}>
          <ListItemIcon>
            <EditRoundedIcon fontSize="small" />
          </ListItemIcon>
          Renomear / cor
        </MenuItem>
        <MenuItem disabled={primeira} onClick={acao(() => onMover(etapa.id, -1))}>
          <ListItemIcon>
            <ChevronLeftRoundedIcon fontSize="small" />
          </ListItemIcon>
          Mover para a esquerda
        </MenuItem>
        <MenuItem disabled={ultima} onClick={acao(() => onMover(etapa.id, 1))}>
          <ListItemIcon>
            <ChevronRightRoundedIcon fontSize="small" />
          </ListItemIcon>
          Mover para a direita
        </MenuItem>
        <MenuItem onClick={acao(() => onExcluirColuna(etapa))} sx={{ color: "error.main" }}>
          <ListItemIcon>
            <DeleteOutlineRoundedIcon fontSize="small" color="error" />
          </ListItemIcon>
          Excluir coluna
        </MenuItem>
      </Menu>

      <Box
        ref={setNodeRef}
        sx={{
          flex: 1,
          minHeight: { xs: 400, md: 0 },
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 1,
          p: 1,
          borderRadius: 3,
          border: "2px dashed",
          borderColor: isOver ? "primary.main" : "divider",
          bgcolor: (t) =>
            isOver ? alpha(t.palette.primary.main, 0.05) : alpha(t.palette.background.paper, 0.4),
          transition: "background-color .2s, border-color .2s",
        }}
      >
        {clientes.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              textAlign: "center",
              color: "text.disabled",
              fontSize: 12,
            }}
          >
            Arraste clientes para cá
          </Box>
        ) : (
          clientes.map((c) => <ClienteCard key={c.id} cliente={c} onEdit={onEdit} />)
        )}
      </Box>
    </Box>
  );
}
