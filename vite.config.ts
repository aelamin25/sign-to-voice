import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// The API server (server/index.ts) runs on 8787. Vite proxies /api and /sign-clips to it,
// so the browser never sees an API key.
// HTTPS=1 (npm run dev:phone) serves over https with a local certificate, because phones
// only allow the camera and microphone on secure origins.
export default defineConfig({
  plugins: [react(), ...(process.env.HTTPS ? [basicSsl()] : [])],
  base: "./",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/sign-clips": "http://localhost:8787",
    },
  },
});
