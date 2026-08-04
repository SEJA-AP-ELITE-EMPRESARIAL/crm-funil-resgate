import { useState } from "react";

import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { Link as RotaLink } from "react-router-dom";

import CartaoAuth, { ESTILO_BOTAO } from "@/components/auth/CartaoAuth";
import api from "@/services/api";

/**
 * Página pública que consome o link de senha (`/definir-senha?token=…`).
 *
 * O token vem do Conecta ID e identifica a pessoa sozinho — não há `uid`, e é
 * por isso que a tela não pergunta quem você é. É o caminho de quem NÃO
 * consegue entrar, então ela vive fora do PrivateRoute.
 *
 * O link é gerado na tela de usuários do kanban: o Conecta ID só devolve o
 * token para aplicações com `pode_gerir_identidades`, e essa é só o kanban.
 */
export default function DefinirSenha() {
  const token = new URLSearchParams(window.location.search).get("token") || "";

  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!senha) return setErro("Informe a nova senha.");
    if (senha !== confirma) return setErro("A confirmação não bate com a senha.");

    setEnviando(true);
    try {
      await api.post("/api/crm/senha/definir/", { token, nova_senha: senha });
      setPronto(true);
    } catch (err) {
      const dados = err.response?.data || {};
      // `nova_senha` traz a recusa da política do Conecta ID (senha fraca),
      // que é acionável; `detail` traz o resto.
      setErro(dados.nova_senha || dados.detail || "Não foi possível definir a senha.");
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <CartaoAuth titulo="Link inválido">
        <Alert severity="error">
          Este endereço não traz um link de senha. Peça um novo a um administrador.
        </Alert>
      </CartaoAuth>
    );
  }

  if (pronto) {
    return (
      <CartaoAuth titulo="Senha definida">
        <Alert severity="success" sx={{ mb: 2 }}>
          Pronto. Você já pode entrar com a sua nova senha.
        </Alert>
        <Button component={RotaLink} to="/login" fullWidth sx={ESTILO_BOTAO}>
          Ir para o login
        </Button>
      </CartaoAuth>
    );
  }

  return (
    <CartaoAuth
      titulo="Definir sua senha"
      descricao="Escolha uma senha só sua. Quem gerou o link não fica sabendo dela."
    >
      {erro && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {erro}
        </Alert>
      )}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          fullWidth
          autoFocus
        />
        <TextField
          label="Confirme a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
          fullWidth
        />
        <Button type="submit" disabled={enviando} fullWidth sx={ESTILO_BOTAO}>
          {enviando ? <CircularProgress size={22} sx={{ color: "#1A1A18" }} /> : "Definir senha"}
        </Button>
        <Typography variant="caption" color="text.secondary" align="center" sx={{ pt: 1 }}>
          Mínimo de 10 caracteres, e sem parecer com o seu e-mail ou nome.
        </Typography>
      </Box>
    </CartaoAuth>
  );
}
