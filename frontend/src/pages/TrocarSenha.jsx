import { useState } from "react";

import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

import CartaoAuth, { ESTILO_BOTAO } from "@/components/auth/CartaoAuth";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/services/api";

/**
 * Troca da própria senha, para quem já está dentro.
 *
 * A senha atual é exigida como prova de posse — sem ela, uma sessão sequestrada
 * (aba aberta em máquina compartilhada) trocaria a senha e tomaria a conta sem
 * nunca ter sabido a original. Quem confere é o Conecta ID, não este app.
 *
 * A saída para o logout existe de propósito: esta tela é a que aparece para
 * quem foi obrigado a trocar a senha, e uma tela obrigatória sem saída é
 * armadilha.
 */
export default function TrocarSenha() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const obrigatoria = Boolean(user?.precisa_trocar_senha);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!atual || !nova) return setErro("Preencha a senha atual e a nova.");
    if (nova !== confirma) return setErro("A confirmação não bate com a nova senha.");
    if (nova === atual) return setErro("A nova senha precisa ser diferente da atual.");

    setEnviando(true);
    try {
      await api.post("/api/crm/senha/", { senha_atual: atual, nova_senha: nova });
      setPronto(true);
    } catch (err) {
      const dados = err.response?.data || {};
      setErro(
        dados.senha_atual ||
          dados.nova_senha ||
          dados.detail ||
          "Não foi possível trocar a senha.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <CartaoAuth titulo="Senha alterada">
        <Alert severity="success" sx={{ mb: 2 }}>
          Sua senha foi trocada no Conecta ID. Ela vale para todos os sistemas em que
          você usa este e-mail.
        </Alert>
        <Button fullWidth sx={ESTILO_BOTAO} onClick={() => navigate("/", { replace: true })}>
          Voltar ao funil
        </Button>
      </CartaoAuth>
    );
  }

  return (
    <CartaoAuth
      titulo="Trocar senha"
      descricao={
        obrigatoria
          ? "Enquanto a senha for a que outra pessoa definiu, ela não é só sua. Escolha uma agora."
          : "A senha vale para todos os sistemas em que você usa este e-mail."
      }
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
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          fullWidth
          autoFocus
        />
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          fullWidth
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
          {enviando ? <CircularProgress size={22} sx={{ color: "#1A1A18" }} /> : "Trocar senha"}
        </Button>
        <Typography variant="caption" color="text.secondary" align="center" sx={{ pt: 1 }}>
          Mínimo de 10 caracteres, e sem parecer com o seu e-mail ou nome.
        </Typography>
        <Button size="small" color="inherit" onClick={logout} sx={{ mt: -1 }}>
          Sair
        </Button>
      </Box>
    </CartaoAuth>
  );
}
