import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API server (server/index.ts) runs on 8787. Vite proxies /api and /sign-clips to it,
// so the browser never sees an API key.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/sign-clips": "http://localhost:8787",
    },
  },
});
