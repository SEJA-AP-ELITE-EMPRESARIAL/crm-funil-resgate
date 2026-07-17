import { Navigate, Route, Routes } from "react-router-dom";

import { PrivateRoute } from "@/components/auth/PrivateRoute";
import Funil from "@/pages/Funil";
import Login from "@/pages/Login";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
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
