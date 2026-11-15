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
  // The avatar and transcription libraries are loaded only when first needed. Unless they are prepared
  // at start-up, the dev server prepares them at that moment and reloads the page, which wiped the
  // visit just as the avatar was about to speak for the first time.
  optimizeDeps: { include: ["@anam-ai/js-sdk", "@elevenlabs/client"] },
  server: {
    // 5180, and only 5180: if another project already has the port, Vite stops with an error
    // instead of quietly moving to the next one (which sent people to the wrong app).
    port: 5180,
    strictPort: true,
    // a shared link (scripts/share.sh) reaches this server under a trycloudflare.com name
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": "http://localhost:8787",
      "/sign-clips": "http://localhost:8787",
      // For a phone: it can't reach the laptop's "localhost", so the Python backend (signs, sentences)
      // and live.py's camera picture are also served through this address. See src/app/config.ts.
      "/py": { target: "http://localhost:8000", ws: true, changeOrigin: true, rewrite: (p) => p.replace(/^\/py/, "") },
      "/camera": { target: "http://localhost:8001", changeOrigin: true, rewrite: (p) => p.replace(/^\/camera/, "") },
    },
  },
});
