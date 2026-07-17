/**
 * Sessão via JWT (espelha o AuthContext do ConectaAP, enxuto).
 * login → /api/token/ (aceita e-mail ou username); usuário → /api/crm/me/.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

import api, { clearTokens, getAccessToken, setTokens } from "@/services/api";

const AuthCtx = createContext({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const carregarUsuario = useCallback(async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/api/crm/me/");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarUsuario();
    const onExpire = () => {
      setUser(null);
    };
    window.addEventListener("crm-token-expired", onExpire);
    return () => window.removeEventListener("crm-token-expired", onExpire);
  }, [carregarUsuario]);

  const login = useCallback(async (loginOuEmail, senha) => {
    try {
      const { data } = await api.post("/api/token/", {
        username: loginOuEmail,
        password: senha,
      });
      setTokens({ access: data.access, refresh: data.refresh });
      const me = await api.get("/api/crm/me/");
      setUser(me.data);
      return { success: true, user: me.data };
    } catch (error) {
      const status = error.response?.status;
      const msg =
        status === 401
          ? "E-mail ou senha incorretos"
          : error.response?.data?.detail || "Falha ao entrar. Tente novamente.";
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider
      value={{ user, loading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
