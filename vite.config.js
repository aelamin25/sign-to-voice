import { defineConfig } from "vite";

// The page runs on 5173 and forwards /api calls to the small server on 3001.
export default defineConfig({
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3001" },
  },
});
