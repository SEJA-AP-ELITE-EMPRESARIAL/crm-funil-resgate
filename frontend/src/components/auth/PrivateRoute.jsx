import { Box, CircularProgress } from "@mui/material";
import { Navigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

export function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

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

  return children;
}
