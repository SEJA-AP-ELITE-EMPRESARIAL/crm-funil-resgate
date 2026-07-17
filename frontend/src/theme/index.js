/**
 * Tema MUI — identidade SEJA AP / ConectaAP (preto + dourado), dark-first.
 * Espelha src/theme/index.js do ConectaAP. As 7 cores de etapa entram em
 * palette.stages (acessível via theme.palette.stages.<etapa>).
 */
import { createTheme, alpha } from "@mui/material/styles";

import { STAGE_COLORS } from "@/lib/stages";

const primaryMain = "#C7A444";
const secondaryMain = "#4A4A49";

const FONT_HEAD = "'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
const FONT_BODY = "'Roboto', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

export const createAppTheme = (mode = "dark") => {
  const isDark = mode === "dark";
  const backgroundDefault = isDark ? "#141412" : "#EFEDE8";
  const backgroundPaper = isDark ? "#1E1E1C" : "#F7F6F2";
  const surfaceElevated = isDark ? "#323230" : "#FFFFFF";
  const textPrimary = isDark ? "#F0F0F0" : "#1C1C1A";
  const textSecondary = isDark ? "#C7C7C7" : "#4A4A46";
  const textMuted = isDark ? "#A0A0A0" : "#76766E";
  const borderLight = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)";
  const focusRing = `0 0 0 3px ${alpha(primaryMain, isDark ? 0.32 : 0.28)}`;

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain, light: "#F5C244", dark: "#9C7C21", contrastText: "#1A1A18" },
      secondary: { main: secondaryMain, light: "#6C6C6B", dark: "#3C3C3B", contrastText: "#ffffff" },
      background: { default: backgroundDefault, paper: backgroundPaper },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
        disabled: isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.42)",
      },
      divider: alpha(primaryMain, isDark ? 0.18 : 0.14),
      success: { main: isDark ? "#28A745" : "#1E8E3E" },
      warning: { main: isDark ? "#FFC107" : "#E6A800" },
      error: { main: isDark ? "#DC3545" : "#C62828" },
      info: { main: isDark ? "#17A2B8" : "#0D8FA8" },
      // Extensões custom
      surface: { base: backgroundPaper, elevated: surfaceElevated, muted: textMuted, borderLight },
      stages: STAGE_COLORS,
    },
    shape: { borderRadius: 8 },
    spacing: 8,
    typography: {
      fontFamily: FONT_BODY,
      fontSize: 14,
      fontWeightLight: 300,
      fontWeightRegular: 400,
      fontWeightMedium: 500,
      fontWeightBold: 600,
      h1: { fontFamily: FONT_HEAD, fontWeight: 600, fontSize: "clamp(2rem,3vw,3.5rem)", letterSpacing: "-0.015em" },
      h2: { fontFamily: FONT_HEAD, fontWeight: 600, fontSize: "clamp(1.75rem,2.4vw,3rem)", letterSpacing: "-0.01em" },
      h3: { fontFamily: FONT_HEAD, fontWeight: 600, fontSize: "clamp(1.5rem,2vw,2.25rem)" },
      h4: { fontFamily: FONT_HEAD, fontWeight: 600, fontSize: "clamp(1.25rem,1.6vw,1.75rem)" },
      h5: { fontFamily: FONT_HEAD, fontWeight: 600, fontSize: "clamp(1.1rem,1.2vw,1.375rem)" },
      h6: { fontFamily: FONT_HEAD, fontWeight: 600, fontSize: "clamp(1rem,1vw,1.125rem)" },
      subtitle1: { fontWeight: 600, fontSize: "1rem", letterSpacing: "0.005em" },
      subtitle2: { fontWeight: 500, fontSize: "0.9rem", letterSpacing: "0.01em" },
      body1: { fontSize: "clamp(0.875rem,1vw,1rem)", lineHeight: 1.6 },
      body2: { fontSize: "clamp(0.8125rem,0.9vw,0.9375rem)", lineHeight: 1.45 },
      button: { fontFamily: FONT_HEAD, fontWeight: 600, letterSpacing: "0.04em" },
      overline: { fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": { colorScheme: mode },
          body: { backgroundColor: backgroundDefault, color: textPrimary },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: alpha(primaryMain, 0.3),
            borderRadius: 999,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: { backgroundImage: "none", backgroundColor: backgroundPaper, borderRadius: 12 },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, variant: "contained" },
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: "none",
            minHeight: 40,
            paddingInline: 20,
            "&:focus-visible": { boxShadow: focusRing },
          },
          sizeSmall: { minHeight: 34, paddingInline: 14 },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 8, "&:focus-visible": { boxShadow: focusRing } } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: alpha(primaryMain, isDark ? 0.24 : 0.18),
            },
            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: alpha(primaryMain, isDark ? 0.5 : 0.42),
            },
            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: primaryMain,
              borderWidth: 2,
            },
          },
        },
      },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            border: `1px solid ${alpha(primaryMain, isDark ? 0.2 : 0.14)}`,
            backgroundImage: "none",
          },
        },
      },
      MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 600 } } },
      MuiTableCell: { styleOverrides: { root: { borderColor: borderLight } } },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: "0.75rem",
            fontWeight: 500,
            borderRadius: 6,
            backgroundColor: isDark ? alpha("#000", 0.9) : alpha("#2c2c2a", 0.92),
          },
        },
      },
    },
  });
};

export default createAppTheme("dark");
