import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const frontendHost = process.env.FLOWDESK_FRONTEND_HOST ?? "127.0.0.1";
const frontendPort = Number.parseInt(process.env.FLOWDESK_FRONTEND_PORT ?? "5173", 10);
const backendOrigin =
  process.env.VITE_BACKEND_ORIGIN ??
  `http://${process.env.FLOWDESK_BACKEND_PROXY_HOST ?? "127.0.0.1"}:${process.env.FLOWDESK_BACKEND_PORT ?? "8000"}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: frontendHost,
    port: frontendPort,
    proxy: {
      "/api": {
        target: backendOrigin,
        changeOrigin: true
      }
    }
  }
});
