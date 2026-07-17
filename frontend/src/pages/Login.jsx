import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import logoSejaAp from "@/assets/logo-sejaap.png";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) navigate("/", { replace: true });
  }, [isAuthenticated, loading, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!email.trim() || senha.length < 6) {
      setErro("Informe e-mail e senha (mínimo 6 caracteres).");
      return;
    }
    setEnviando(true);
    const res = await login(email.trim(), senha);
    setEnviando(false);
    if (res.success) navigate("/", { replace: true });
    else setErro(res.error);
  }

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
          <Box component="img" src={logoSejaAp} alt="SEJA AP" sx={{ height: 64, objectFit: "contain" }} />
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Acesse com seu e-mail e senha cadastrados.
          </Typography>

          {erro && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {erro}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="E-mail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
              autoFocus
            />
            <TextField
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              fullWidth
            />
            <Button
              type="submit"
              disabled={enviando}
              sx={{
                mt: 1,
                py: 1.2,
                fontWeight: 600,
                color: "#1A1A18",
                background: "linear-gradient(135deg, #C7A444 0%, #9C7C21 100%)",
                boxShadow: "0 4px 16px rgba(199,164,68,0.28)",
                "&:hover": { filter: "brightness(1.05)", background: "linear-gradient(135deg, #C7A444 0%, #9C7C21 100%)" },
              }}
            >
              {enviando ? <CircularProgress size={22} sx={{ color: "#1A1A18" }} /> : "Entrar"}
            </Button>
            <Typography variant="caption" color="text.secondary" align="center" sx={{ pt: 1 }}>
              Cadastros são gerenciados pelo administrador.
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
