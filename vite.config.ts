import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// The frontend is a React SPA built by Vite into ./dist.
// The Cloudflare Worker (worker/index.ts) is bundled + deployed by Wrangler and
// serves the built assets via the Workers Assets binding. During `npm run dev`
// the Vite dev server proxies /api requests to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
