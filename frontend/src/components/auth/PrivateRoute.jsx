import { Box, CircularProgress } from "@mui/material";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

export function PrivateRoute({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  const { pathname } = useLocation();

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
        }}
      >
        <CircularProgress color="primary" />
      </Box>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Enquanto a senha for a que outra pessoa definiu, a conta não é só da
  // pessoa — e um aviso que dá para ignorar é um aviso que ninguém atende.
  //
  // A exceção para /trocar-senha não é detalhe: sem ela o redirecionamento se
  // persegue, porque a própria tela de troca é uma rota protegida. Esse laço já
  // aconteceu na implementação do Financeiro; está aqui para não repetir.
  if (user?.precisa_trocar_senha && pathname !== "/trocar-senha") {
    return <Navigate to="/trocar-senha" replace />;
  }

  return children;
}
