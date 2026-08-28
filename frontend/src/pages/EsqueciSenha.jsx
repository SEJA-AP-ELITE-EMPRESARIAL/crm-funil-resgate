import { useState } from "react";

import { Alert, Box, Button, CircularProgress, TextField, Typography } from "@mui/material";
import { Link as RotaLink } from "react-router-dom";

import CartaoAuth, { ESTILO_BOTAO } from "@/components/auth/CartaoAuth";
import api from "@/services/api";

/**
 * Página pública que pede o link de senha (`/esqueci-senha`).
 *
 * A outra metade de `DefinirSenha`: aqui a pessoa pede o link, lá ela usa. Até
 * 28/08/2026 esta metade não existia — quem esquecia a senha dependia de um
 * administrador gerar o link pela tela do kanban e entregar por WhatsApp.
 *
 * A confirmação **não diz se a conta existe**, e a frase assume isso em voz
 * alta ("se houver uma conta"). A rota é pública: sem essa uniformidade, um
 * estranho descobre quem trabalha aqui um palpite por vez. Fingir sucesso
 * também não serviria — soaria mentiroso para quem errou o próprio e-mail.
 *
 * O formulário continua na tela depois do envio, com "enviar de novo": o e-mail
 * demora alguns segundos e às vezes cai no lixo eletrônico.
 */
export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro("");
    if (!email) return setErro("Informe o seu e-mail.");

    setEnviando(true);
    try {
      await api.post("/api/crm/senha/esqueci/", { email });
      setPedido(true);
    } catch (err) {
      // Só chega aqui o que não é sobre a conta: serviço fora do ar ou campo
      // vazio. E-mail desconhecido responde sucesso, de propósito.
      setErro(err.response?.data?.detail || "Não foi possível pedir o link agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <CartaoAuth
      titulo="Esqueci minha senha"
      descricao="Informe seu e-mail e enviamos o link para você definir uma senha nova."
    >
      {erro && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {erro}
        </Alert>
      )}
      {pedido && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Se houver uma conta com esse e-mail, o link acabou de ser enviado. Ele
          vale 48 horas e serve uma vez só. Não chegou? Veja o lixo eletrônico
          ou peça de novo.
        </Alert>
      )}
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TextField
          label="Seu e-mail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          fullWidth
          autoFocus
        />
        <Button type="submit" disabled={enviando} fullWidth sx={ESTILO_BOTAO}>
          {enviando ? (
            <CircularProgress size={22} sx={{ color: "#1A1A18" }} />
          ) : pedido ? (
            "Enviar de novo"
          ) : (
            "Enviar o link"
          )}
        </Button>
        <Button component={RotaLink} to="/login" fullWidth variant="text" size="small">
          Voltar para o login
        </Button>
        <Typography variant="caption" color="text.secondary" align="center">
          A senha vale em todos os sistemas do Seja AP.
        </Typography>
      </Box>
    </CartaoAuth>
  );
}
