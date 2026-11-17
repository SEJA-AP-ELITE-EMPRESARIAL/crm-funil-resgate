/**
 * Playwright: só o e2e do sinal de presença (TSK-1521), que precisa do backend e
 * do Conecta falso de pé. Quem sobe tudo é o `e2e/rodar-presenca.sh`; rodar
 * `playwright test` sozinho não acha nada no ar. Não entra no `npm test`.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120 * 1000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_URL,
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
});
