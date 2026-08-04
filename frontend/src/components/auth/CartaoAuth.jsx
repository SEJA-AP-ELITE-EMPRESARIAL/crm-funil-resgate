import { Box, Paper, Typography } from "@mui/material";

import logoSejaAp from "@/assets/logo-sejaap.png";

/**
 * Moldura das telas de credencial (login, definir senha, trocar senha).
 *
 * Existe para as três não divergirem: a de senha é a tela que a pessoa vê
 * quando já está com um problema, e uma que parece de outro sistema é a que faz
 * ela desconfiar que o link era golpe.
 */
export default function CartaoAuth({ titulo, descricao, children }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        bgcolor: "background.default",
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 400 }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 4 }}>
          <Box
            component="img"
            src={logoSejaAp}
            alt="SEJA AP"
            sx={{ height: 64, objectFit: "contain" }}
          />
        </Box>
        <Paper
          variant="outlined"
          sx={{
            p: 4,
            borderRadius: 3,
            borderColor: "divider",
            bgcolor: (t) => t.palette.surface.elevated,
          }}
        >
          {titulo && (
            <Typography variant="h6" sx={{ mb: 1 }}>
              {titulo}
            </Typography>
          )}
          {descricao && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {descricao}
            </Typography>
          )}
          {children}
        </Paper>
      </Box>
    </Box>
  );
}

export const ESTILO_BOTAO = {
  mt: 1,
  py: 1.2,
  fontWeight: 600,
  color: "#1A1A18",
  background: "linear-gradient(135deg, #C7A444 0%, #9C7C21 100%)",
  boxShadow: "0 4px 16px rgba(199,164,68,0.28)",
  "&:hover": {
    filter: "brightness(1.05)",
    background: "linear-gradient(135deg, #C7A444 0%, #9C7C21 100%)",
  },
};
