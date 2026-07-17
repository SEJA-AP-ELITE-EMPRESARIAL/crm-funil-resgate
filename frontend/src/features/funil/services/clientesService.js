/**
 * Camada de dados do funil — encapsula os endpoints do CRM.
 * Regra do projeto (ConectaAP): páginas/componentes consomem este módulo,
 * nunca chamam api.get direto.
 */
import api from "@/services/api";

const BASE = "/api/crm";

export async function listarClientes() {
  const { data } = await api.get(`${BASE}/clientes/`);
  return data.results ?? [];
}

export async function criarCliente(payload) {
  const { data } = await api.post(`${BASE}/clientes/`, payload);
  return data;
}

export async function atualizarCliente(id, patch) {
  const { data } = await api.patch(`${BASE}/clientes/${id}/`, patch);
  return data;
}

export async function removerCliente(id) {
  await api.delete(`${BASE}/clientes/${id}/`);
}

export async function obterConfig() {
  const { data } = await api.get(`${BASE}/config/`);
  return data;
}

export async function listarFunis() {
  const { data } = await api.get(`${BASE}/funis/`);
  return data.results ?? [];
}

export async function importarClientes(file) {
  const fd = new FormData();
  fd.append("arquivo", file);
  const { data } = await api.post(`${BASE}/clientes/importar/`, fd);
  return data;
}

export async function baixarModeloImportacao() {
  const resp = await api.get(`${BASE}/clientes/modelo-importacao/`, { responseType: "blob" });
  const url = URL.createObjectURL(resp.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-importacao-clientes.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
