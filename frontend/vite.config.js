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
  build: {
    // Source maps só quando o build os manda ao GlitchTip (TSK-1147): o Dockerfile
    // liga SOURCEMAPS_OCULTOS com o token, e apaga os .map depois do envio. 'hidden'
    // não escreve o `//# sourceMappingURL` no .js, então o navegador nem os procura.
    sourcemap: process.env.SOURCEMAPS_OCULTOS === "true" ? "hidden" : false,
    rollupOptions: {
      output: {
        // SDK do GlitchTip num arquivo próprio: só muda quando o @sentry/* muda, e
        // no chunk principal seria baixado de novo a cada deploy.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/]@sentry[\\/]/.test(id)) return "glitchtip";
          return undefined;
        },
      },
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
