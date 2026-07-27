/**
 * Criar / editar uma coluna do Kanban.
 *
 * O slug não é editável de propósito: é o identificador estável que a API e a
 * importação de planilha usam. Renomear a coluna não quebra integração.
 */
import { useEffect, useState } from "react";

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { CORES_SUGERIDAS, TIPOS } from "@/lib/stages";
import { useClientesData } from "@/contexts/ClientesContext";

const VAZIO = { nome: "", emoji: "", cor: CORES_SUGERIDAS[0], tipo: "progressao" };

export function EtapaFormDialog({ open, etapa, onClose }) {
  const { novaEtapa, editarEtapa } = useClientesData();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const editando = !!etapa;

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setForm(
      etapa
        ? { nome: etapa.nome, emoji: etapa.emoji || "", cor: etapa.cor, tipo: etapa.tipo }
        : VAZIO,
    );
  }, [open, etapa]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (editando) await editarEtapa(etapa.id, form);
      else await novaEtapa(form);
      onClose();
    } catch (e) {
      const dados = e?.response?.data;
      setErro(dados?.nome?.[0] || dados?.erro || "Não foi possível salvar a coluna.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{editando ? "Editar coluna" : "Nova coluna"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}

          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Ícone"
              value={form.emoji}
              onChange={set("emoji")}
              placeholder="🔥"
              sx={{ width: 90 }}
              inputProps={{ maxLength: 4, style: { textAlign: "center", fontSize: 20 } }}
            />
            <TextField
              label="Nome da coluna"
              value={form.nome}
              onChange={set("nome")}
              autoFocus
              fullWidth
              required
            />
          </Stack>

          <Box>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Cor
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: "wrap", gap: 1 }}>
              {CORES_SUGERIDAS.map((c) => (
                <Box
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, cor: c }))}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: c,
                    cursor: "pointer",
                    border: "2px solid",
                    borderColor: form.cor === c ? "text.primary" : "transparent",
                    transition: "border-color .15s",
                  }}
                />
              ))}
            </Stack>
          </Box>

          <TextField select label="Tipo" value={form.tipo} onChange={set("tipo")} fullWidth>
            {Object.entries(TIPOS).map(([valor, { label, desc }]) => (
              <MenuItem key={valor} value={valor}>
                <Box>
                  <Typography variant="body2">{label}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {desc}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            O tipo define como a coluna entra no Dashboard: a esteira de conversão é
            formada pelas de <b>progressão</b> e fechada pela de <b>ganho</b>.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={salvando || !form.nome.trim()} variant="contained">
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
