import { useDroppable } from "@dnd-kit/core";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { ClienteCard } from "@/components/funil/ClienteCard";
import { STAGE_META } from "@/lib/stages";

export function StageColumn({ stage, clientes, onEdit }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });
  const meta = STAGE_META[stage];

  return (
    <Box sx={{ width: 288, flexShrink: 0, display: "flex", flexDirection: "column" }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 0.5, mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: meta.color }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {meta.label}
          </Typography>
        </Stack>
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
      </Stack>

      <Box
        ref={setNodeRef}
        sx={{
          minHeight: 400,
          flex: 1,
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
