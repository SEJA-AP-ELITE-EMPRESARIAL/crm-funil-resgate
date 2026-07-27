import { useMemo } from "react";

import ApartmentRoundedIcon from "@mui/icons-material/ApartmentRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
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
import { etapasDaEsteira } from "@/lib/stages";

// Cores da prioridade (P1 = mais quente → P5 = mais fria).
const PRIO_COLORS = { P1: "#DC3545", P2: "#EA932E", P3: "#E4B744", P4: "#3D7EC5", P5: "#8A8A8A" };

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
  const { clientesDoFunil: clientes, etapas } = useClientesData();

  // O funil deixou de ter etapas fixas: a esteira e as colunas de ganho/perda
  // saem do TIPO de cada coluna do funil selecionado.
  const esteira = useMemo(() => etapasDaEsteira(etapas), [etapas]);
  const idsGanho = useMemo(
    () => new Set(etapas.filter((e) => e.tipo === "ganho").map((e) => e.id)),
    [etapas],
  );
  const idsPerda = useMemo(
    () => new Set(etapas.filter((e) => e.tipo === "perda").map((e) => e.id)),
    [etapas],
  );

  const stats = useMemo(() => {
    const inFunnel = clientes.filter((c) => !!c.etapa);
    const reativados = inFunnel.filter((c) => idsGanho.has(c.etapa)).length;
    const perdidos = inFunnel.filter((c) => idsPerda.has(c.etapa)).length;
    const total = inFunnel.length;
    return {
      base: clientes.length,
      total,
      reativados,
      ativos: total - reativados - perdidos,
      taxa: total ? reativados / total : 0,
    };
  }, [clientes, idsGanho, idsPerda]);

  const funnelData = useMemo(() => {
    const posicao = new Map(esteira.map((e, i) => [e.id, i]));
    const inFunnel = clientes.filter((c) => !!c.etapa && posicao.has(c.etapa));
    // Funil acumulado: quem está na etapa i também passou por todas as anteriores.
    return esteira.map((etapa, i) => ({
      stage: etapa.nome,
      qty: inFunnel.filter((c) => posicao.get(c.etapa) >= i).length,
      color: etapa.cor,
    }));
  }, [clientes, esteira]);

  const consultores = useMemo(() => {
    const map = new Map();
    clientes
      .filter((c) => c.etapa)
      .forEach((c) => {
        const k = c.quem_fara_contato || "Sem Consultor";
        const cur = map.get(k) ?? { prio: 0, reat: 0, valor: 0 };
        cur.prio++;
        if (idsGanho.has(c.etapa)) {
          cur.reat++;
          cur.valor += num(c.valor_contrato);
        }
        map.set(k, cur);
      });
    return [...map.entries()].map(([nome, s]) => ({ nome, ...s, taxa: s.prio ? s.reat / s.prio : 0 }));
  }, [clientes, idsGanho]);

  const valorTotal = useMemo(() => consultores.reduce((a, c) => a + c.valor, 0), [consultores]);

  const prioridades = useMemo(() => {
    const ordem = ["P1", "P2", "P3", "P4", "P5"];
    const cont = Object.fromEntries(ordem.map((p) => [p, 0]));
    clientes.forEach((c) => {
      const p = (c.prioridade || "").toUpperCase();
      if (cont[p] != null) cont[p] += 1;
    });
    return ordem.map((p) => ({ prioridade: p, qtd: cont[p], color: PRIO_COLORS[p] }));
  }, [clientes]);
  const totalPrioridades = prioridades.reduce((a, p) => a + p.qtd, 0);

  const motivos = useMemo(() => {
    const map = new Map();
    clientes.forEach((c) => {
      const k = c.motivo_distrato || "Não Informado";
      const cur = map.get(k) ?? { base: 0, prio: 0, reat: 0 };
      cur.base++;
      if (c.etapa) cur.prio++;
      if (idsGanho.has(c.etapa)) cur.reat++;
      map.set(k, cur);
    });
    return [...map.entries()]
      .map(([motivo, s]) => ({ motivo, ...s, taxa: s.prio ? s.reat / s.prio : 0 }))
      .sort((a, b) => b.base - a.base);
  }, [clientes, idsGanho]);

  const maxMotivo = Math.max(1, ...motivos.map((m) => m.base));

  // Cores dos KPIs saem das próprias colunas do funil (a primeira da esteira,
  // uma do meio e a de ganho), com fallback para o dourado do tema.
  const corPrimeira = esteira[0]?.cor ?? theme.palette.primary.main;
  const corMeio = esteira[Math.floor(esteira.length / 2)]?.cor ?? theme.palette.primary.main;
  const corGanho =
    etapas.find((e) => e.tipo === "ganho")?.cor ?? theme.palette.success?.main ?? "#31C47F";
  const rotuloGanho = etapas.find((e) => e.tipo === "ganho")?.nome ?? "Ganhos";

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        {[
          { label: "Base Total", value: String(stats.base), icon: ApartmentRoundedIcon, color: theme.palette.primary.main },
          { label: "No Funil", value: String(stats.total), icon: TrackChangesRoundedIcon, color: corPrimeira },
          { label: "Em Andamento", value: String(stats.ativos), icon: BoltRoundedIcon, color: corMeio },
          { label: rotuloGanho, value: String(stats.reativados), icon: EmojiEventsRoundedIcon, color: corGanho },
          { label: "Taxa de Conversão", value: `${(stats.taxa * 100).toFixed(1)}%`, icon: TrendingUpRoundedIcon, color: theme.palette.primary.main },
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
              labelStyle={{ color: "#fff", fontWeight: 600 }}
              itemStyle={{ color: "#fff" }}
              formatter={(value) => [value, "Clientes"]}
            />
            <Bar dataKey="qty" radius={[0, 6, 6, 0]}>
              {funnelData.map((d) => (
                <Cell key={d.stage} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </PanelCard>

      <PanelCard title="Distribuição por Prioridade" subtitle="Leads por prioridade — P1 é a mais quente, P5 a mais fria." icon={FlagRoundedIcon}>
        {totalPrioridades > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={prioridades} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="prioridade" stroke={theme.palette.text.secondary} fontSize={12} />
              <YAxis allowDecimals={false} stroke={theme.palette.text.secondary} fontSize={12} />
              <Tooltip
                cursor={{ fill: alpha(theme.palette.primary.main, 0.08) }}
                contentStyle={{
                  background: theme.palette.background.paper,
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#fff", fontWeight: 600 }}
                itemStyle={{ color: "#fff" }}
                formatter={(value) => [value, "Clientes"]}
              />
              <Bar dataKey="qtd" radius={[6, 6, 0, 0]}>
                {prioridades.map((d) => (
                  <Cell key={d.prioridade} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Box sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
            Sem prioridade definida neste funil.
          </Box>
        )}
      </PanelCard>

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
