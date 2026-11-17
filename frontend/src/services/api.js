/**
 * Cliente HTTP único (axios) — espelha o padrão do ConectaAP:
 * baseURL dinâmica, JWT no localStorage, injeção de Bearer e refresh
 * automático em 401. Toda chamada de API passa por aqui.
 */
import axios from "axios";

const ACCESS_KEY = "crm_access_token";
const REFRESH_KEY = "crm_refresh_token";

// === Token helpers ===
export const getAccessToken = () => localStorage.getItem(ACCESS_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const setTokens = ({ access, refresh }) => {
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
};
export const clearTokens = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

// === baseURL ===
const getApiBaseUrl = () => {
  // DEV: baseURL vazia → Vite faz proxy de /api para o Django.
  if (import.meta.env.DEV) return "";
  const viteApi = import.meta.env.VITE_API_URL;
  if (viteApi && viteApi.trim()) return viteApi.trim().replace(/\/$/, "");
  return ""; // PROD same-origin (proxy reverso)
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || "60000", 10),
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

const isAuthEndpoint = (url = "") =>
  url.includes("/api/token/");

// === Request: injeta Bearer ===
api.interceptors.request.use((config) => {
  // Deixa o browser definir o boundary do multipart em uploads.
  if (config.data instanceof FormData) delete config.headers["Content-Type"];
  if (!isAuthEndpoint(config.url)) {
    const token = getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// === Response: refresh automático em 401 ===
let refreshing = null;

async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error("sem refresh token");
  // Usa axios cru para não recursar no interceptor. Com o mesmo prazo das
  // outras chamadas: a renovação é dividida (o sinal de presença e as ações da
  // tela), e uma pendurada seguraria todas.
  const { data } = await axios.post(
    `${getApiBaseUrl()}/api/token/refresh/`,
    { refresh },
    { timeout: api.defaults.timeout },
  );
  // A pessoa saiu (ou entrou outra) enquanto o refresh ia e voltava: gravar o
  // access agora a devolveria ao sistema.
  if (getRefreshToken() !== refresh) throw new Error("a sessão mudou durante a renovação");
  setTokens({ access: data.access });
  return data.access;
}

/**
 * Renova o access sem efeito nenhum na falha: não limpa a sessão nem leva ao
 * login (isso fica para o interceptor abaixo, numa ação da pessoa). É o que o
 * sinal de presença usa (TSK-1521, `lib/presenca.js`). Divide com o
 * interceptor a renovação que já estiver em andamento.
 */
export async function renovarAcessoEmSilencio() {
  const emAndamento = refreshing || refreshAccessToken();
  refreshing = emAndamento;
  try {
    return await emAndamento;
  } finally {
    if (refreshing === emAndamento) refreshing = null;
  }
}

api.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;

    if (status === 401 && original && !original._retry && !isAuthEndpoint(original.url)) {
      original._retry = true;
      try {
        refreshing = refreshing || refreshAccessToken();
        const newToken = await refreshing;
        refreshing = null;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        refreshing = null;
        clearTokens();
        window.dispatchEvent(new CustomEvent("crm-token-expired"));
      }
    }
    return Promise.reject(error);
  },
);

export default api;
