import { useMemo } from "react";

import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PercentRoundedIcon from "@mui/icons-material/PercentRounded";
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
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

import { useClientesData } from "@/contexts/ClientesContext";
import { fmtBRL, num } from "@/lib/format";

function Kpi({ label, value, icon: Icon, color }) {
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
        <Box sx={{ width: 42, height: 42, borderRadius: 1.75, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(color, 0.12), color }}>
          <Icon />
        </Box>
      </Stack>
    </Paper>
  );
}

export function Comissionamento() {
  const theme = useTheme();
  const { clientesDoFunil: clientes, config } = useClientesData();
  const pct = `${((config.comissao_rate ?? 0.03) * 100).toFixed(0)}%`;

  const linhas = useMemo(() => {
    const map = new Map();
    clientes
      .filter((c) => c.etapa === "reativado")
      .forEach((c) => {
        const k = c.quem_fara_contato || "Sem Responsável";
        const cur = map.get(k) ?? { reat: 0, valorContrato: 0, parcelaMensal: 0, comissaoMensal: 0 };
        cur.reat++;
        cur.valorContrato += num(c.valor_contrato);
        cur.parcelaMensal += num(c.parcela_mensal);
        cur.comissaoMensal += num(c.comissao_mensal);
        map.set(k, cur);
      });
    return [...map.entries()]
      .map(([nome, s]) => ({ nome, ...s }))
      .sort((a, b) => b.comissaoMensal - a.comissaoMensal);
  }, [clientes]);

  const totals = useMemo(
    () =>
      linhas.reduce(
        (acc, l) => ({
          reat: acc.reat + l.reat,
          valorContrato: acc.valorContrato + l.valorContrato,
          parcelaMensal: acc.parcelaMensal + l.parcelaMensal,
          comissaoMensal: acc.comissaoMensal + l.comissaoMensal,
        }),
        { reat: 0, valorContrato: 0, parcelaMensal: 0, comissaoMensal: 0 },
      ),
    [linhas],
  );

  const money = (n) => fmtBRL(n, 2);

  return (
    <Stack spacing={3}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi label="Resgates" value={String(totals.reat)} icon={GroupsRoundedIcon} color={theme.palette.stages.reativado} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi label="Valor Recuperado" value={money(totals.valorContrato)} icon={PaidRoundedIcon} color={theme.palette.primary.main} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi label="Parcela Mensal Total" value={money(totals.parcelaMensal)} icon={TrendingUpRoundedIcon} color={theme.palette.stages.conectado} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <Kpi label={`Comissão Mensal (${pct})`} value={money(totals.comissaoMensal)} icon={PercentRoundedIcon} color={theme.palette.primary.main} />
        </Grid>
      </Grid>

      <Paper variant="outlined" sx={{ p: 3, borderColor: "divider", bgcolor: (t) => t.palette.surface.elevated }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <PercentRoundedIcon sx={{ color: "primary.main" }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Comissionamento por Responsável
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Comissão recorrente de {pct} sobre a parcela mensal (valor do contrato ÷ meses) de cada cliente resgatado.
            </Typography>
          </Box>
        </Stack>

        <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell>#</TableCell>
                <TableCell>Responsável</TableCell>
                <TableCell align="right">Resgates</TableCell>
                <TableCell align="right">Valor Contrato</TableCell>
                <TableCell align="right">Parcela Mensal</TableCell>
                <TableCell align="right">Comissão Mensal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {linhas.map((l, i) => (
                <TableRow key={l.nome} hover>
                  <TableCell sx={{ fontWeight: 700, color: "primary.main" }}>{i + 1}º</TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{l.nome}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "success.main" }}>{l.reat}</TableCell>
                  <TableCell align="right">{money(l.valorContrato)}</TableCell>
                  <TableCell align="right">{money(l.parcelaMensal)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: "primary.main" }}>{money(l.comissaoMensal)}</TableCell>
                </TableRow>
              ))}
              {linhas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: "text.secondary", py: 4 }}>
                    Ainda não há clientes resgatados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            {linhas.length > 0 && (
              <TableFooter>
                <TableRow sx={{ bgcolor: "background.default" }}>
                  <TableCell />
                  <TableCell sx={{ textTransform: "uppercase", fontSize: 12, color: "text.secondary" }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{totals.reat}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{money(totals.valorContrato)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{money(totals.parcelaMensal)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: "primary.main" }}>{money(totals.comissaoMensal)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>

        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
          * Comissão recorrente — paga mensalmente enquanto o cliente permanecer ativo.
        </Typography>
      </Paper>
    </Stack>
  );
}
