import { memo } from "react";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import { Box, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

import { fmtBRL, num } from "@/lib/format";

// Cores da prioridade (P1 = mais quente → P5 = mais frio).
const PRIO_COLORS = {
  P1: "#DC3545",
  P2: "#EA932E",
  P3: "#E4B744",
  P4: "#3D7EC5",
  P5: "#8A8A8A",
};

function ClienteCardBase({ cliente, overlay = false, onEdit }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cliente.id,
    disabled: overlay,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  const isReativado = cliente.etapa === "reativado";
  const valor = num(cliente.valor_contrato);
  const mostrarValores = isReativado && valor > 0;
  const parcela = num(cliente.parcela_mensal);
  const prioColor = PRIO_COLORS[cliente.prioridade];

  function handleClick() {
    if (isDragging || overlay) return;
    onEdit?.(cliente);
  }

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      sx={{
        cursor: "grab",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 1.5,
        transition: "transform .15s, box-shadow .15s, border-color .15s",
        "&:hover": {
          transform: "translateY(-2px)",
          borderColor: (t) => alpha(t.palette.primary.main, 0.4),
          boxShadow: 3,
        },
        "&:active": { cursor: "grabbing" },
      }}
    >
      {(cliente.funil_nome || prioColor) && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 0.75 }}>
          {cliente.funil_nome ? (
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, bgcolor: cliente.funil_cor || "text.disabled" }} />
              <Typography noWrap sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "text.secondary" }}>
                {cliente.funil_nome}
              </Typography>
            </Box>
          ) : (
            <span />
          )}
          {prioColor && (
            <Box
              title={`Prioridade ${cliente.prioridade}`}
              sx={{
                flexShrink: 0,
                px: 0.75,
                py: 0.125,
                borderRadius: 1,
                fontSize: 10,
                fontWeight: 800,
                lineHeight: 1.6,
                bgcolor: alpha(prioColor, 0.15),
                color: prioColor,
                border: `1px solid ${alpha(prioColor, 0.4)}`,
              }}
            >
              {cliente.prioridade}
            </Box>
          )}
        </Stack>
      )}

      <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
        <Box
          sx={{
            mt: 0.25,
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 1.25,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
            color: "primary.main",
          }}
        >
          <ApartmentRoundedIcon sx={{ fontSize: 16 }} />
        </Box>
        <Typography
          variant="body2"
          sx={{
            flex: 1,
            minWidth: 0,
            fontWeight: 600,
            lineHeight: 1.25,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {cliente.nome}
        </Typography>
        {mostrarValores && (
          <Stack alignItems="flex-end" spacing={0.25} sx={{ flexShrink: 0, textAlign: "right" }}>
            <Box
              sx={{
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                bgcolor: (t) => alpha(t.palette.stages.reativado, 0.15),
                color: "stages.reativado",
                fontSize: 11,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtBRL(valor)}
            </Box>
            <Typography sx={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", color: "text.secondary" }}>
              {fmtBRL(parcela)}/mês
            </Typography>
          </Stack>
        )}
      </Stack>

      <Stack spacing={0.5} sx={{ color: "text.secondary", fontSize: 12 }}>
        {cliente.quem_fara_contato && (
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <PersonRoundedIcon sx={{ fontSize: 12 }} />
            <Typography variant="caption" noWrap>
              {cliente.quem_fara_contato}
            </Typography>
          </Stack>
        )}
        {cliente.municipio && (
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <PlaceRoundedIcon sx={{ fontSize: 12 }} />
            <Typography variant="caption" noWrap>
              {cliente.municipio}
              {cliente.estado ? `, ${cliente.estado}` : ""}
            </Typography>
          </Stack>
        )}
      </Stack>

      {cliente.motivo_distrato && (
        <Box
          sx={{
            mt: 1,
            display: "inline-flex",
            px: 0.75,
            py: 0.25,
            borderRadius: 1,
            bgcolor: "action.hover",
            fontSize: 10,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            color: "text.secondary",
          }}
        >
          {cliente.motivo_distrato}
        </Box>
      )}
    </Box>
  );
}

export const ClienteCard = memo(ClienteCardBase);
