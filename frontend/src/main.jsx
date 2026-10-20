import { CssBaseline, ThemeProvider } from "@mui/material";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "@/App";
import { AuthProvider } from "@/contexts/AuthContext";
import { iniciarGlitchtip } from "@/services/glitchtip";
import theme from "@/theme";

// Erros não tratados vão ao GlitchTip (TSK-1147). Sem VITE_SENTRY_DSN no build,
// não liga e nada sai do navegador.
iniciarGlitchtip();

createRoot(document.getElementById("root")).render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ThemeProvider>,
);
