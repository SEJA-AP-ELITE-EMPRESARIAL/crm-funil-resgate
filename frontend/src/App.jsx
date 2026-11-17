import { Navigate, Route, Routes } from "react-router-dom";

import { PrivateRoute } from "@/components/auth/PrivateRoute";
import { SinalDePresenca } from "@/components/SinalDePresenca";
import DefinirSenha from "@/pages/DefinirSenha";
import EsqueciSenha from "@/pages/EsqueciSenha";
import Funil from "@/pages/Funil";
import Login from "@/pages/Login";
import TrocarSenha from "@/pages/TrocarSenha";

export default function App() {
  return (
    <>
      {/* O sinal de presença ao Conecta (TSK-1521): fora das rotas, para o
          relógio sobreviver à troca de tela. Só manda logado e em tela interna. */}
      <SinalDePresenca />
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Pública de propósito: é o caminho de quem não consegue entrar. */}
        <Route path="/definir-senha" element={<DefinirSenha />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
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
    </>
  );
}
