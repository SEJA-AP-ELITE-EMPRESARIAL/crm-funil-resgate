import { useMemo, useState } from "react";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import LockResetRoundedIcon from "@mui/icons-material/LockResetRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import ViewKanbanRoundedIcon from "@mui/icons-material/ViewKanbanRounded";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link as RotaLink } from "react-router-dom";

import logoSejaAp from "@/assets/logo-sejaap.png";
import { Dashboard } from "@/components/funil/Dashboard";
import { ClienteFormDialog } from "@/components/funil/ClienteFormDialog";
import { FunilFormDialog } from "@/components/funil/FunilFormDialog";
import { ImportarDialog } from "@/components/funil/ImportarDialog";
import { KanbanBoard } from "@/components/funil/KanbanBoard";
import { useAuth } from "@/contexts/AuthContext";
import { ClientesProvider, useClientesData } from "@/contexts/ClientesContext";

const MAX_W = 1600;

// Valor sentinela do seletor: abre o formulário em vez de trocar de funil.
const NOVO_FUNIL = "__novo__";

function FunilInner() {
  const { user, logout } = useAuth();
  const { clientesDoFunil: clientes, etapas, funis, funilSel, setFunilSel, funilAtivo } =
    useClientesData();
  const [tab, setTab] = useState("kanban");
  const [search, setSearch] = useState("");
  const [consultor, setConsultor] = useState("all");
  const [motivo, setMotivo] = useState("all");
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [funilForm, setFunilForm] = useState(null); // {aberto, funil}

  function trocarFunil(e) {
    const valor = e.target.value;
    if (valor === NOVO_FUNIL) {
      setFunilForm({ aberto: true, funil: null });
      return;
    }
    setFunilSel(valor);
  }

  const consultores = useMemo(() => {
    const s = new Set();
    clientes.forEach((c) => c.etapa && s.add(c.quem_fara_contato || "Sem Consultor"));
    return [...s].sort();
  }, [clientes]);

  const motivos = useMemo(() => {
    const s = new Set();
    clientes.forEach((c) => c.etapa && s.add(c.motivo_distrato || "Não Informado"));
    return [...s].sort();
  }, [clientes]);

  const noFunil = clientes.filter((c) => !!c.etapa).length;
  // "ganho" é o tipo da coluna que fecha o funil — o nome dela muda de funil
  // para funil ("Inscrito", "Reativado"...), então contamos pelo tipo.
  const ganhos = clientes.filter((c) => c.etapa_tipo === "ganho").length;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      {/* Header */}
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: (t) => alpha(t.palette.background.paper, 0.7),
          backdropFilter: "blur(20px)",
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ maxWidth: MAX_W, mx: "auto", px: 3, py: 2 }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box component="img" src={logoSejaAp} alt="SEJA AP" sx={{ height: 48, objectFit: "contain" }} />
            <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", sm: "block" } }} />
            <Box sx={{ display: { xs: "none", sm: "block" } }}>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {funilAtivo?.nome ?? "—"} · {clientes.length} na base · {etapas.length} colunas · {noFunil} no funil · {ganhos} ganhos
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Button
              onClick={() => setImportando(true)}
              size="small"
              variant="outlined"
              startIcon={<UploadFileRoundedIcon />}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                Importar
              </Box>
            </Button>
            <Button
              onClick={() => setCriando(true)}
              size="small"
              startIcon={<AddRoundedIcon />}
              sx={{
                fontWeight: 600,
                color: "#1A1A18",
                background: "linear-gradient(135deg, #C7A444 0%, #9C7C21 100%)",
                "&:hover": { filter: "brightness(1.05)", background: "linear-gradient(135deg, #C7A444 0%, #9C7C21 100%)" },
              }}
            >
              Novo cliente
            </Button>
            {/* A descrição vem do funil selecionado: com funis criados pela
                própria equipe, um rótulo fixo mentiria em todos menos um. */}
            <Chip
              size="small"
              label={funilAtivo?.descricao || funilAtivo?.nome || "—"}
              sx={{
                display: { xs: "none", sm: funilAtivo ? "flex" : "none" },
                maxWidth: 220,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                color: "primary.main",
                border: (t) => `1px solid ${alpha(t.palette.primary.main, 0.3)}`,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            />
            {user && (
              <Typography
                variant="caption"
                sx={{
                  display: { xs: "none", md: "block" },
                  color: "text.secondary",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={user.email}
              >
                {user.email || user.username}
              </Typography>
            )}
            <Tooltip title="Trocar senha">
              <Button
                component={RotaLink}
                to="/trocar-senha"
                size="small"
                variant="outlined"
                startIcon={<LockResetRoundedIcon />}
              >
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  Senha
                </Box>
              </Button>
            </Tooltip>
            <Tooltip title="Sair">
              <Button onClick={logout} size="small" variant="outlined" startIcon={<LogoutRoundedIcon />}>
                <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                  Sair
                </Box>
              </Button>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      <ClienteFormDialog open={criando} onClose={() => setCriando(false)} />
      <ImportarDialog open={importando} onClose={() => setImportando(false)} />
      <FunilFormDialog
        open={!!funilForm?.aberto}
        funil={funilForm?.funil}
        onClose={() => setFunilForm(null)}
      />

      {/* Conteúdo */}
      <Box component="main" sx={{ maxWidth: MAX_W, mx: "auto", px: 3, py: 3 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          alignItems={{ md: "center" }}
          justifyContent="space-between"
          spacing={2}
          sx={{ mb: 3 }}
        >
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <TextField
                select
                value={funilSel ?? ""}
                onChange={trocarFunil}
                sx={{ minWidth: 210 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <FilterAltRoundedIcon fontSize="small" sx={{ color: "primary.main" }} />
                    </InputAdornment>
                  ),
                }}
              >
                {funis.map((f) => (
                  <MenuItem key={f.slug} value={f.slug}>
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: f.cor }} />
                      {f.nome}
                    </Box>
                  </MenuItem>
                ))}
                <Divider sx={{ my: 0.5 }} />
                <MenuItem value={NOVO_FUNIL}>
                  <Box
                    component="span"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 1, color: "primary.main" }}
                  >
                    <AddRoundedIcon fontSize="small" />
                    Novo funil
                  </Box>
                </MenuItem>
              </TextField>
              <Tooltip title="Editar funil">
                <span>
                  <IconButton
                    onClick={() => setFunilForm({ aberto: true, funil: funilAtivo })}
                    disabled={!funilAtivo}
                    size="small"
                  >
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <Tabs
              value={tab}
              onChange={(_e, v) => setTab(v)}
              sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}
            >
              <Tab value="kanban" icon={<ViewKanbanRoundedIcon fontSize="small" />} iconPosition="start" label="Kanban" />
              <Tab value="dashboard" icon={<DashboardRoundedIcon fontSize="small" />} iconPosition="start" label="Dashboard" />
            </Tabs>
          </Stack>

          {tab === "kanban" && (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <TextField
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente..."
                sx={{ width: 220 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField select value={consultor} onChange={(e) => setConsultor(e.target.value)} sx={{ width: 180 }}>
                <MenuItem value="all">Todos os consultores</MenuItem>
                {consultores.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select value={motivo} onChange={(e) => setMotivo(e.target.value)} sx={{ width: 200 }}>
                <MenuItem value="all">Todos os motivos</MenuItem>
                {motivos.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          )}
        </Stack>

        {tab === "kanban" && (
          <KanbanBoard filterConsultor={consultor} filterMotivo={motivo} search={search} />
        )}
        {tab === "dashboard" && <Dashboard />}
      </Box>
    </Box>
  );
}

export default function Funil() {
  return (
    <ClientesProvider>
      <FunilInner />
    </ClientesProvider>
  );
}
