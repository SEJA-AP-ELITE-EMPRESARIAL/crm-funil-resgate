import { useMemo, useState } from "react";

import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import PercentRoundedIcon from "@mui/icons-material/PercentRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
import ViewKanbanRoundedIcon from "@mui/icons-material/ViewKanbanRounded";
import {
  Box,
  Button,
  Chip,
  Divider,
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

import logoSejaAp from "@/assets/logo-sejaap.png";
import { Comissionamento } from "@/components/funil/Comissionamento";
import { Dashboard } from "@/components/funil/Dashboard";
import { ClienteFormDialog } from "@/components/funil/ClienteFormDialog";
import { ImportarDialog } from "@/components/funil/ImportarDialog";
import { KanbanBoard } from "@/components/funil/KanbanBoard";
import { useAuth } from "@/contexts/AuthContext";
import { ClientesProvider, useClientesData } from "@/contexts/ClientesContext";

const MAX_W = 1600;

function FunilInner() {
  const { user, logout } = useAuth();
  const { clientesDoFunil: clientes, funis, funilSel, setFunilSel } = useClientesData();
  const [tab, setTab] = useState("kanban");
  const [search, setSearch] = useState("");
  const [consultor, setConsultor] = useState("all");
  const [motivo, setMotivo] = useState("all");
  const [criando, setCriando] = useState(false);
  const [importando, setImportando] = useState(false);

  const funilAtivo = funis.find((f) => f.slug === funilSel) || null;

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
  const reat = clientes.filter((c) => c.etapa === "reativado").length;

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
                {funilAtivo ? funilAtivo.nome : "Todos os funis"} · {clientes.length} na base · {noFunil} no funil · {reat} reativados
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
            <Chip
              size="small"
              label="Win-back"
              sx={{
                display: { xs: "none", sm: "flex" },
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
            <TextField
              select
              value={funilSel}
              onChange={(e) => setFunilSel(e.target.value)}
              sx={{ minWidth: 210 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <FilterAltRoundedIcon fontSize="small" sx={{ color: "primary.main" }} />
                  </InputAdornment>
                ),
              }}
            >
              <MenuItem value="all">Todos os funis</MenuItem>
              {funis.map((f) => (
                <MenuItem key={f.slug} value={f.slug}>
                  <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: f.cor }} />
                    {f.nome}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
            <Tabs
              value={tab}
              onChange={(_e, v) => setTab(v)}
              sx={{ minHeight: 40, "& .MuiTab-root": { minHeight: 40, textTransform: "none", fontWeight: 600 } }}
            >
              <Tab value="kanban" icon={<ViewKanbanRoundedIcon fontSize="small" />} iconPosition="start" label="Kanban" />
              <Tab value="dashboard" icon={<DashboardRoundedIcon fontSize="small" />} iconPosition="start" label="Dashboard" />
              <Tab value="comissionamento" icon={<PercentRoundedIcon fontSize="small" />} iconPosition="start" label="Comissionamento" />
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
        {tab === "comissionamento" && <Comissionamento />}
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
