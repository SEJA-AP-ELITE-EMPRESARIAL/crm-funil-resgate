import { useEffect, useState } from "react";

import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RotaLink, useNavigate } from "react-router-dom";

import logoSejaAp from "@/assets/logo-sejaap.png";
import { useAuth } from "@/contexts/AuthContext";
import { formatarPrevisao } from "@/lib/manutencao";

// Dourado é cor de letra: o claro do tema no escuro, o escuro no claro.
const DOURADO = (t) => (t.palette.mode === "dark" ? t.palette.primary.main : t.palette.primary.dark);

/**
 * O login central em manutenção (TSK-1240): no lugar do formulário, o aviso
 * publicado no Conecta e a previsão de volta, se houver. "Tentar de novo"
 * devolve o formulário; o Conecta é que diz se a manutenção acabou.
 */
function EmManutencao({ mensagem, previsao, aoTentarDeNovo }) {
  const quando = formatarPrevisao(previsao);
  return (
    <Box role="status" aria-labelledby="manutencao-titulo" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <ConstructionRoundedIcon aria-hidden="true" sx={{ fontSize: 32, color: DOURADO }} />
      <Box>
        <Typography id="manutencao-titulo" variant="h6" component="h1">
          Temporariamente indisponível
        </Typography>
        <Typography variant="body2" sx={{ color: DOURADO, fontWeight: 600 }}>
          Em manutenção
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {mensagem || "O login está em manutenção. Volte em instantes."}
      </Typography>
      {quando && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ScheduleRoundedIcon aria-hidden="true" fontSize="small" sx={{ color: DOURADO }} />
          <Typography variant="body2">Previsão de volta: {quando}</Typography>
        </Box>
      )}
      <Button variant="outlined" onClick={aoTentarDeNovo} sx={{ mt: 1, py: 1.2, fontWeight: 600 }}>
        Tentar de novo
      </Button>
    </Box>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  // `{ mensagem, previsao }` com o login central em manutenção; `null` no resto.
  const [manutencao, setManutencao] = useState(null);

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
    else if (res.manutencao) setManutencao(res.manutencao);
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
          {manutencao ? (
            <EmManutencao
              mensagem={manutencao.mensagem}
              previsao={manutencao.previsao}
              aoTentarDeNovo={() => setManutencao(null)}
            />
          ) : (
          <>
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
            <Typography
              component={RotaLink}
              to="/esqueci-senha"
              variant="caption"
              align="center"
              sx={{ pt: 1, color: "text.secondary" }}
            >
              Esqueci minha senha
            </Typography>
            <Typography variant="caption" color="text.secondary" align="center">
              Cadastros são gerenciados pelo administrador.
            </Typography>
          </Box>
          </>
          )}
        </Paper>
      </Box>
    </Box>
  );
}
