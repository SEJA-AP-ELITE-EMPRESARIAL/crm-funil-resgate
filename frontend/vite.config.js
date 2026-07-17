import path from "path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Espelha as convenções do frontend ConectaAP: aliases @/ e proxy /api em dev.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Em dev o axios usa baseURL "" e o Vite encaminha /api para o Django.
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
