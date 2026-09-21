import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  preview: { host: "127.0.0.1", port: 4173 },
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: { "/api": "http://127.0.0.1:4317", "/health": "http://127.0.0.1:4317" },
  },
});
