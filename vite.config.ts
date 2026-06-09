/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The UI runs on Vite's dev server (5173) and proxies API + websocket
// traffic to the Inkleaf web server (8788), which owns the SQLite store.
export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  publicDir: false,
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Regex key (leading ^) so it matches `/api/...` routes only — NOT the
      // UI's own `api.ts` module, which Vite must serve itself.
      "^/api/": { target: "http://localhost:8788", changeOrigin: true },
      "/ws": { target: "ws://localhost:8788", ws: true },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    root: ".",
  },
});
