import { Navigate, Route, Routes } from "react-router-dom";

import { PrivateRoute } from "@/components/auth/PrivateRoute";
import DefinirSenha from "@/pages/DefinirSenha";
import Funil from "@/pages/Funil";
import Login from "@/pages/Login";
import TrocarSenha from "@/pages/TrocarSenha";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Pública de propósito: é o caminho de quem não consegue entrar. */}
      <Route path="/definir-senha" element={<DefinirSenha />} />
      <Route
        path="/trocar-senha"
        element={
          <PrivateRoute>
            <TrocarSenha />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Funil />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
