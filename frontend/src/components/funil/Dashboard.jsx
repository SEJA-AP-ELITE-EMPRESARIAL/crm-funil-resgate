import { useMemo } from "react";

import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import TrackChangesRoundedIcon from "@mui/icons-material/TrackChangesRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import {
  Box,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useClientesData } from "@/contexts/ClientesContext";
import { fmtBRL, num } from "@/lib/format";
import { PROGRESS_STAGES, STAGE_META } from "@/lib/stages";

function KpiCard({ label, value, icon: Icon, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderColor: "divider", bgcolor: (t) => t.palette.surface.elevated }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "text.secondary" }}>
            {label}
          </Typography>
          <Typography sx={{ mt: 1, fontFamily: "Montserrat, sans-serif", fontSize: 30, fontWeight: 800, lineHeight: 1 }}>
            {value}
          </Typography>
        </Box>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 1.75,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: alpha(color, 0.12),
            color,
          }}
        >
          <Icon />
        </Box>
      </Stack>
    </Paper>
  );
}

function PanelCard({ title, subtitle, icon: Icon, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 3, borderColor: "divider", bgcolor: (t) => t.palette.surface.elevated }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        {Icon && <Icon sx={{ color: "primary.main" }} />}
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {children}
    </Paper>
  );
}

export function Dashboard() {
  const theme = useTheme();
  const { clientesDoFunil: clientes } = useClientesData();

  const stats = useMemo(() => {
    const inFunnel = clientes.filter((c) => !!c.etapa);
    const reativados = inFunnel.filter((c) => c.etapa === "reativado").length;
    const perdidos = inFunnel.filter((c) => c.etapa === "perdido").length;
    const total = inFunnel.length;
    return {
      base: clientes.length,
      total,
      reativados,
      ativos: total - reativados - perdidos,
      taxa: total ? reativados / total : 0,
    };
  }, [clientes]);

  const funnelData = useMemo(() => {
    const inFunnel = clientes.filter((c) => !!c.etapa);
    return PROGRESS_STAGES.map((s, i) => {
      const qty = inFunnel.filter((c) => {
        if (!c.etapa || c.etapa === "perdido") return false;
        return PROGRESS_STAGES.indexOf(c.etapa) >= i;
      }).length;
      return { stage: STAGE_META[s].label, qty, color: STAGE_META[s].color };
    });
  }, [clientes]);

  const consultores = useMemo(() => {
    const map = new Map();
    clientes
      .filter((c) => c.etapa)
      .forEach((c) => {
        const k = c.quem_fara_contato || "Sem Consultor";
        const cur = map.get(k) ?? { prio: 0, reat: 0, valor: 0 };
        cur.prio++;
        if (c.etapa === "reativado") {
          cur.reat++;
          cur.valor += num(c.valor_contrato);
        }
        map.set(k, cur);
      });
    return [...map.entries()].map(([nome, s]) => ({ nome, ...s, taxa: s.prio ? s.reat / s.prio : 0 }));
  }, [clientes]);

  const rankingReat = useMemo(
    () => [...consultores].sort((a, b) => b.reat - a.reat || b.valor - a.valor || b.prio - a.prio),
    [consultores],
  );
  const rankingValor = useMemo(
    () => [...consultores].sort((a, b) => b.valor - a.valor || b.reat - a.reat),
    [consultores],
  );
  const valorTotal = useMemo(() => consultores.reduce((a, c) => a + c.valor, 0), [consultores]);

  const motivos = useMemo(() => {
    const map = new Map();
    clientes.forEach((c) => {
      const k = c.motivo_distrato || "Não Informado";
      const cur = map.get(k) ?? { base: 0, prio: 0, reat: 0 };
      cur.base++;
      if (c.etapa) cur.prio++;
      if (c.etapa === "reativado") cur.reat++;
      map.set(k, cur);
    });
    return [...map.entries()]
      .map(([motivo, s]) => ({ motivo, ...s, taxa: s.prio ? s.reat / s.prio : 0 }))
      .sort((a, b) => b.base - a.base);
  }, [clientes]);

  const maxMotivo = Math.max(1, ...motivos.map((m) => m.base));

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        {[
          { label: "Base Total", value: String(stats.base), icon: ApartmentRoundedIcon, color: theme.palette.primary.main },
          { label: "No Funil", value: String(stats.total), icon: TrackChangesRoundedIcon, color: STAGE_META.priorizado.color },
          { label: "Em Andamento", value: String(stats.ativos), icon: BoltRoundedIcon, color: STAGE_META.conectado.color },
          { label: "Reativados", value: String(stats.reativados), icon: EmojiEventsRoundedIcon, color: STAGE_META.reativado.color },
          { label: "Taxa Reativação", value: `${(stats.taxa * 100).toFixed(1)}%`, icon: TrendingUpRoundedIcon, color: theme.palette.primary.main },
          { label: "Valor Recuperado", value: fmtBRL(valorTotal), icon: PaidRoundedIcon, color: theme.palette.primary.main },
        ].map((k) => (
          <Grid size={{ xs: 12, sm: 6, lg: 2 }} key={k.label}>
            <KpiCard {...k} />
          </Grid>
        ))}
      </Grid>

      <PanelCard title="Conversão por Etapa" subtitle="Quantidade de clientes que alcançaram cada etapa.">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={funnelData} layout="vertical" margin={{ left: 12, right: 24 }}>
            <XAxis type="number" stroke={theme.palette.text.secondary} fontSize={12} />
            <YAxis dataKey="stage" type="category" stroke={theme.palette.text.secondary} fontSize={12} width={120} />
            <Tooltip
              cursor={{ fill: alpha(theme.palette.primary.main, 0.08) }}
              contentStyle={{
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="qty" radius={[0, 6, 6, 0]}>
              {funnelData.map((d) => (
                <Cell key={d.stage} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <PanelCard title="Ranking — Reativações" subtitle="Consultores ordenados pelo número de reativações." icon={EmojiEventsRoundedIcon}>
            <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "background.default" }}>
                    <TableCell>#</TableCell>
                    <TableCell>Consultor</TableCell>
                    <TableCell align="right">Reat</TableCell>
                    <TableCell align="right">Prio</TableCell>
                    <TableCell align="right">Taxa</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rankingReat.slice(0, 12).map((c, i) => (
                    <TableRow key={c.nome} hover>
                      <TableCell sx={{ fontWeight: 700, color: "primary.main" }}>{i + 1}º</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{c.nome}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: "success.main" }}>{c.reat}</TableCell>
                      <TableCell align="right">{c.prio}</TableCell>
                      <TableCell align="right">{(c.taxa * 100).toFixed(0)}%</TableCell>
                    </TableRow>
                  ))}
                  {rankingReat.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ color: "text.secondary", py: 3 }}>
                        Sem dados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <PanelCard title="Ranking — Valor Recuperado" subtitle="Consultores ordenados pelo valor de contratos resgatados." icon={PaidRoundedIcon}>
            <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "background.default" }}>
                    <TableCell>#</TableCell>
                    <TableCell>Consultor</TableCell>
                    <TableCell align="right">Valor</TableCell>
                    <TableCell align="right">Reat</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rankingValor.slice(0, 12).map((c, i) => (
                    <TableRow key={c.nome} hover>
                      <TableCell sx={{ fontWeight: 700, color: "primary.main" }}>{i + 1}º</TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{c.nome}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: "primary.main" }}>{fmtBRL(c.valor)}</TableCell>
                      <TableCell align="right" sx={{ color: "success.main" }}>{c.reat}</TableCell>
                    </TableRow>
                  ))}
                  {rankingValor.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: "text.secondary", py: 3 }}>
                        Sem dados
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </PanelCard>
        </Grid>
      </Grid>

      <PanelCard title="Análise por Motivo de Distrato" subtitle="Onde estão as maiores oportunidades de win-back.">
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>Motivo</TableCell>
                <TableCell align="right">Base Total</TableCell>
                <TableCell align="right">No Funil</TableCell>
                <TableCell align="right">Reativados</TableCell>
                <TableCell align="right">Taxa Reativação</TableCell>
                <TableCell sx={{ width: "33%" }}>Distribuição</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {motivos.map((m) => (
                <TableRow key={m.motivo}>
                  <TableCell sx={{ fontWeight: 500 }}>{m.motivo}</TableCell>
                  <TableCell align="right">{m.base}</TableCell>
                  <TableCell align="right">{m.prio}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "success.main" }}>{m.reat}</TableCell>
                  <TableCell align="right">{(m.taxa * 100).toFixed(0)}%</TableCell>
                  <TableCell>
                    <Box sx={{ height: 8, width: "100%", borderRadius: 999, bgcolor: "action.hover", overflow: "hidden" }}>
                      <Box sx={{ height: "100%", borderRadius: 999, bgcolor: "primary.main", width: `${(m.base / maxMotivo) * 100}%` }} />
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </PanelCard>
    </Stack>
  );
}
