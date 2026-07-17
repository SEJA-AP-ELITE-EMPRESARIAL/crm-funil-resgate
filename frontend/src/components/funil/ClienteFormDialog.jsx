import { useEffect, useState } from "react";

import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";

import { useClientesData } from "@/contexts/ClientesContext";
import {
  atualizarCliente,
  criarCliente,
  removerCliente,
} from "@/features/funil/services/clientesService";
import { parseValorBR } from "@/lib/format";
import { STAGES, STAGE_META } from "@/lib/stages";

const VAZIO = {
  funil: "",
  nome: "",
  quem_fara_contato: "",
  etapa: "priorizado",
  telefone: "",
  email: "",
  cnpj: "",
  segmento: "",
  municipio: "",
  estado: "",
  produto_atual: "",
  motivo_distrato: "",
  valor_contrato: "",
  meses_contrato: "",
  notas: "",
  // Indicação (funil Indicados APN)
  indicador_nome: "",
  indicador_empresa: "",
  indicador_whatsapp: "",
  indicador_equipe: "",
  faixa_faturamento: "",
  prioridade: "",
  qtd_indicacoes: "",
};

const PRIORIDADES = ["P1", "P2", "P3", "P4", "P5"];

export function ClienteFormDialog({ open, onClose, cliente = null }) {
  const isEdit = !!cliente;
  const { reload, config, funis, funilSel } = useClientesData();
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro("");
    if (cliente) {
      setForm({
        funil: cliente.funil != null ? String(cliente.funil) : "",
        nome: cliente.nome || "",
        quem_fara_contato: cliente.quem_fara_contato || "",
        etapa: cliente.etapa || "none",
        telefone: cliente.telefone || "",
        email: cliente.email || "",
        cnpj: cliente.cnpj || "",
        segmento: cliente.segmento || "",
        municipio: cliente.municipio || "",
        estado: cliente.estado || "",
        produto_atual: cliente.produto_atual || "",
        motivo_distrato: cliente.motivo_distrato || "",
        valor_contrato: cliente.valor_contrato != null ? String(cliente.valor_contrato) : "",
        meses_contrato: cliente.meses_contrato != null ? String(cliente.meses_contrato) : "",
        notas: cliente.notas || "",
        indicador_nome: cliente.indicador_nome || "",
        indicador_empresa: cliente.indicador_empresa || "",
        indicador_whatsapp: cliente.indicador_whatsapp || "",
        indicador_equipe: cliente.indicador_equipe || "",
        faixa_faturamento: cliente.faixa_faturamento || "",
        prioridade: cliente.prioridade || "",
        qtd_indicacoes: cliente.qtd_indicacoes != null ? String(cliente.qtd_indicacoes) : "",
      });
    } else {
      const padrao = funis.find((f) => f.slug === funilSel) || funis[0];
      setForm({ ...VAZIO, funil: padrao ? String(padrao.id) : "" });
    }
  }, [open, cliente, funis, funilSel]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const funilSlug = funis.find((f) => String(f.id) === String(form.funil))?.slug;
  const isAPN = funilSlug === "indicados_apn";

  async function handleSubmit() {
    setErro("");
    if (!form.nome.trim()) {
      setErro("Nome é obrigatório.");
      return;
    }
    const valorNum = form.valor_contrato ? parseValorBR(form.valor_contrato) : null;
    if (form.valor_contrato && valorNum === null) {
      setErro("Valor do contrato inválido.");
      return;
    }
    const meses = form.meses_contrato ? parseInt(form.meses_contrato, 10) : null;
    if (form.meses_contrato && (!meses || meses <= 0)) {
      setErro("Duração do contrato deve ser um número de meses maior que zero.");
      return;
    }

    const payload = {
      funil: form.funil ? parseInt(form.funil, 10) : null,
      nome: form.nome.trim(),
      quem_fara_contato: form.quem_fara_contato,
      etapa: form.etapa === "none" ? null : form.etapa,
      telefone: form.telefone,
      email: form.email,
      cnpj: form.cnpj,
      segmento: form.segmento,
      municipio: form.municipio,
      estado: form.estado,
      produto_atual: form.produto_atual,
      motivo_distrato: form.motivo_distrato,
      valor_contrato: valorNum,
      meses_contrato: meses,
      notas: form.notas,
      indicador_nome: form.indicador_nome,
      indicador_empresa: form.indicador_empresa,
      indicador_whatsapp: form.indicador_whatsapp,
      indicador_equipe: form.indicador_equipe,
      faixa_faturamento: form.faixa_faturamento,
      prioridade: form.prioridade,
      qtd_indicacoes: form.qtd_indicacoes ? parseInt(form.qtd_indicacoes, 10) : null,
    };

    setSalvando(true);
    try {
      if (isEdit) await atualizarCliente(cliente.id, payload);
      else await criarCliente(payload);
      await reload();
      onClose();
    } catch (e) {
      setErro(e.response?.data?.nome?.[0] || "Erro ao salvar cliente.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleDelete() {
    setSalvando(true);
    try {
      await removerCliente(cliente.id);
      await reload();
      setConfirmar(false);
      onClose();
    } catch {
      setErro("Erro ao remover cliente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {isEdit ? "Editar cliente" : "Novo cliente"}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {isEdit ? "Atualize os dados do cliente." : "Cadastre um novo cliente no funil de resgate."}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          {erro && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {erro}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Funil" value={form.funil} onChange={set("funil")} fullWidth>
                {funis.length === 0 && <MenuItem value="">—</MenuItem>}
                {funis.map((f) => (
                  <MenuItem key={f.id} value={String(f.id)}>
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: f.cor }} />
                      {f.nome}
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Nome / Empresa *" value={form.nome} onChange={set("nome")} fullWidth inputProps={{ maxLength: 200 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Consultor responsável" placeholder="Quem fará o contato" value={form.quem_fara_contato} onChange={set("quem_fara_contato")} fullWidth inputProps={{ maxLength: 120 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Etapa" value={form.etapa} onChange={set("etapa")} fullWidth>
                <MenuItem value="none">Sem etapa (fora do funil)</MenuItem>
                {STAGES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {STAGE_META[s].label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Telefone" value={form.telefone} onChange={set("telefone")} fullWidth inputProps={{ maxLength: 40 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Email" type="email" value={form.email} onChange={set("email")} fullWidth inputProps={{ maxLength: 160 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="CNPJ" value={form.cnpj} onChange={set("cnpj")} fullWidth inputProps={{ maxLength: 40 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Segmento" value={form.segmento} onChange={set("segmento")} fullWidth inputProps={{ maxLength: 120 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Município" value={form.municipio} onChange={set("municipio")} fullWidth inputProps={{ maxLength: 120 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Estado" value={form.estado} onChange={set("estado")} fullWidth inputProps={{ maxLength: 40 }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Produto atual" value={form.produto_atual} onChange={set("produto_atual")} fullWidth inputProps={{ maxLength: 120 }} />
            </Grid>
            {isAPN && (
              <>
                <Grid size={12}>
                  <Divider textAlign="left" sx={{ "&::before": { width: "1%" }, color: "text.secondary", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Indicação
                  </Divider>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Indicado por" value={form.indicador_nome} onChange={set("indicador_nome")} fullWidth inputProps={{ maxLength: 120 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Empresa do indicador" value={form.indicador_empresa} onChange={set("indicador_empresa")} fullWidth inputProps={{ maxLength: 160 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="WhatsApp do indicador" value={form.indicador_whatsapp} onChange={set("indicador_whatsapp")} fullWidth inputProps={{ maxLength: 40 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Equipe do indicador" value={form.indicador_equipe} onChange={set("indicador_equipe")} fullWidth inputProps={{ maxLength: 120 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select label="Prioridade" value={form.prioridade} onChange={set("prioridade")} fullWidth>
                    <MenuItem value="">—</MenuItem>
                    {PRIORIDADES.map((p) => (
                      <MenuItem key={p} value={p}>{p}</MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField label="Faixa de faturamento" value={form.faixa_faturamento} onChange={set("faixa_faturamento")} fullWidth inputProps={{ maxLength: 60 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField label="Qtd. indicações do indicador" value={form.qtd_indicacoes} onChange={set("qtd_indicacoes")} fullWidth inputProps={{ inputMode: "numeric", maxLength: 4 }} />
                </Grid>
              </>
            )}

            {!isAPN && (
              <>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Motivo distrato" value={form.motivo_distrato} onChange={set("motivo_distrato")} fullWidth inputProps={{ maxLength: 160 }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Valor do contrato recuperado (R$)"
                    value={form.valor_contrato}
                    onChange={set("valor_contrato")}
                    fullWidth
                    inputProps={{ inputMode: "decimal", maxLength: 20 }}
                    placeholder="Ex: 12500,00 — preenchido quando Reativado"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Duração do contrato (meses)"
                    value={form.meses_contrato}
                    onChange={set("meses_contrato")}
                    fullWidth
                    inputProps={{ inputMode: "numeric", maxLength: 3 }}
                    placeholder={`Padrão: ${config.meses_contrato_padrao} meses`}
                    helperText="Parametriza a parcela mensal (valor ÷ meses)."
                  />
                </Grid>
              </>
            )}
            <Grid size={12}>
              <TextField label="Notas" value={form.notas} onChange={set("notas")} fullWidth multiline rows={4} inputProps={{ maxLength: 2000 }} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 2 }}>
          <Box>
            {isEdit && (
              <Button
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlineRoundedIcon />}
                onClick={() => setConfirmar(true)}
              >
                Excluir
              </Button>
            )}
          </Box>
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="outlined" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={salvando}>
              {salvando ? "Salvando..." : isEdit ? "Salvar alterações" : "Adicionar"}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmar} onClose={() => setConfirmar(false)}>
        <DialogTitle>Excluir cliente?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Esta ação remove <strong>{cliente?.nome}</strong> permanentemente do funil. Não é possível desfazer.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button variant="outlined" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button color="error" onClick={handleDelete} disabled={salvando}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
