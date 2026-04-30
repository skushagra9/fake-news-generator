import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In dev we proxy /api -> backend on port 4000 so the frontend uses
// same-origin URLs everywhere (dev + prod nginx).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
