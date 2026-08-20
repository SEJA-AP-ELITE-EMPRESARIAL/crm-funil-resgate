/**
 * Criar / editar um funil (quadro).
 *
 * O slug não é editável, mesmo motivo do da coluna: é o identificador estável
 * que a API e as integrações usam. Renomear o funil não quebra ninguém.
 *
 * Sair de um funil tem dois caminhos, e a diferença importa:
 * - **desativar** tira do seletor e preserva tudo (é o caminho normal);
 * - **excluir** só é possível se não houver cliente nenhum, e leva as colunas
 *   junto — por isso a confirmação diz quantas são.
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
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { CORES_SUGERIDAS } from "@/lib/stages";
import { useClientesData } from "@/contexts/ClientesContext";

const VAZIO = { nome: "", cor: CORES_SUGERIDAS[0], descricao: "" };

export function FunilFormDialog({ open, funil, onClose }) {
  const { novoFunil, editarFunil, excluirFunil } = useClientesData();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const editando = !!funil;
  const totalColunas = funil?.etapas?.length ?? 0;
  const totalClientes = funil?.total_clientes ?? 0;

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setConfirmandoExclusao(false);
    setForm(
      funil
        ? { nome: funil.nome, cor: funil.cor, descricao: funil.descricao || "" }
        : VAZIO,
    );
  }, [open, funil]);

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  function relatarErro(e, padrao) {
    const dados = e?.response?.data;
    setErro(dados?.nome?.[0] || dados?.cor?.[0] || dados?.erro || padrao);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      if (editando) await editarFunil(funil.id, form);
      else await novoFunil(form);
      onClose();
    } catch (e) {
      relatarErro(e, "Não foi possível salvar o funil.");
    } finally {
      setSalvando(false);
    }
  }

  async function desativar() {
    setSalvando(true);
    setErro(null);
    try {
      await editarFunil(funil.id, { ativo: false });
      onClose();
    } catch (e) {
      relatarErro(e, "Não foi possível desativar o funil.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    setSalvando(true);
    setErro(null);
    try {
      await excluirFunil(funil.id);
      onClose();
    } catch (e) {
      relatarErro(e, "Não foi possível excluir o funil.");
      setConfirmandoExclusao(false);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{editando ? "Editar funil" : "Novo funil"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {erro && <Alert severity="error">{erro}</Alert>}

          <TextField
            label="Nome do funil"
            value={form.nome}
            onChange={set("nome")}
            autoFocus
            fullWidth
            required
          />

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

          <TextField
            label="Descrição"
            value={form.descricao}
            onChange={set("descricao")}
            fullWidth
            placeholder="Para que serve este funil (opcional)"
          />

          {!editando && (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              O funil nasce <b>sem colunas</b>: o próximo passo é criar as etapas do fluxo
              dele, que são independentes das dos outros funis.
            </Typography>
          )}

          {editando && (
            <>
              <Divider />
              {confirmandoExclusao ? (
                <Alert severity="warning" sx={{ alignItems: "flex-start" }}>
                  <Typography variant="body2">
                    Excluir <b>{funil.nome}</b> remove também
                    {totalColunas === 1 ? " a sua 1 coluna" : ` as suas ${totalColunas} colunas`}.
                    Funil com cliente não pode ser excluído — nesse caso, desative.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                    <Button size="small" color="error" variant="contained" onClick={excluir} disabled={salvando}>
                      Excluir mesmo assim
                    </Button>
                    <Button size="small" color="inherit" onClick={() => setConfirmandoExclusao(false)}>
                      Cancelar
                    </Button>
                  </Stack>
                </Alert>
              ) : (
                <Stack spacing={1}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {totalClientes} cliente(s) · {totalColunas} coluna(s)
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" color="inherit" onClick={desativar} disabled={salvando}>
                      Desativar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setConfirmandoExclusao(true)}
                      disabled={salvando}
                    >
                      Excluir
                    </Button>
                  </Stack>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Desativar tira o funil do seletor e preserva clientes, colunas e histórico.
                  </Typography>
                </Stack>
              )}
            </>
          )}
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
