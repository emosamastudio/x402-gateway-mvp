import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8403",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/gateway": {
        target: "http://localhost:8402",
        rewrite: (path) => path.replace(/^\/gateway/, ""),
      },
    },
  },
});
